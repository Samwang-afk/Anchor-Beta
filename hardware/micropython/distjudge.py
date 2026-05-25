from machine import Pin, I2C
import time
from vl53l0x_driver import VL53L0X

try:
    import ujson as json
except ImportError:
    import json


SDA_PIN = 21
SCL_PIN = 22
I2C_FREQ = 100000
FILTER_SIZE = 5
SAMPLE_INTERVAL_MS = 200
ENTER_THRESHOLD_MM = 25
ENTER_HOLD_MS = 1000
EXIT_HOLD_MS = 3000
DISTANCE_MIN_MM = 1
DISTANCE_MAX_MM = 2000
BAD_DISTANCE_MM = 8190
BAD_READ_LIMIT = 5
REINIT_SETTLE_MS = 300
RAW_COVERED_DISTANCE_MM = 40
CALIBRATED_COVERED_DISTANCE_MM = 20
DISTANCE_OFFSET_MM = RAW_COVERED_DISTANCE_MM - CALIBRATED_COVERED_DISTANCE_MM


def emit(payload):
    try:
        print(json.dumps(payload))
    except Exception:
        print(payload)


def make_sensor():
    i2c = I2C(0, scl=Pin(SCL_PIN), sda=Pin(SDA_PIN), freq=I2C_FREQ)
    scan = i2c.scan()
    print("I2C scan:", [hex(x) for x in scan])
    if VL53L0X.ADDR not in scan:
        raise OSError("VL53L0X not found at 0x29")
    return VL53L0X(i2c, debug=True)


def median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def is_plausible_distance(distance):
    return DISTANCE_MIN_MM <= distance <= DISTANCE_MAX_MM


def is_bad_distance(distance):
    return distance >= BAD_DISTANCE_MM


def calibrate_distance(distance):
    corrected = distance - DISTANCE_OFFSET_MM
    if corrected < 0:
        return 0
    return corrected


def main():
    sensor = make_sensor()
    samples = []
    on_deck = False
    enter_since = None
    exit_since = None
    bad_reads = 0
    print("distjudge start, enter when corrected distance <", ENTER_THRESHOLD_MM)

    while True:
        try:
            now = time.ticks_ms()
            distance, status, raw_status = sensor.read_raw()
            usable = is_plausible_distance(distance)
            corrected_distance = calibrate_distance(distance) if usable else None

            if is_bad_distance(distance):
                bad_reads += 1
            else:
                bad_reads = 0

            if usable:
                samples.append(corrected_distance)
                if len(samples) > FILTER_SIZE:
                    samples.pop(0)
                filtered_distance = median(samples)
            else:
                filtered_distance = None

            close_now = usable and (corrected_distance < ENTER_THRESHOLD_MM)

            if on_deck:
                enter_since = None
                if close_now:
                    exit_since = None
                else:
                    if exit_since is None:
                        exit_since = now
                    elif time.ticks_diff(now, exit_since) >= EXIT_HOLD_MS:
                        on_deck = False
                        exit_since = None
            else:
                exit_since = None
                if close_now:
                    if enter_since is None:
                        enter_since = now
                    elif time.ticks_diff(now, enter_since) >= ENTER_HOLD_MS:
                        on_deck = True
                        enter_since = None
                else:
                    enter_since = None

            emit({
                "distance_mm": distance,
                "corrected_mm": corrected_distance,
                "filtered_mm": filtered_distance,
                "close": close_now,
                "on-deck": on_deck,
                "valid": usable,
                "status": status,
                "raw_status": raw_status,
            })

            if bad_reads >= BAD_READ_LIMIT:
                print("recover VL53L0X after repeated 819x readings")
                time.sleep_ms(REINIT_SETTLE_MS)
                sensor = make_sensor()
                samples = []
                enter_since = None
                bad_reads = 0

        except Exception as exc:
            emit({"error": str(exc), "on-deck": False, "valid": False})
            try:
                time.sleep_ms(REINIT_SETTLE_MS)
                sensor = make_sensor()
                samples = []
                enter_since = None
                bad_reads = 0
            except Exception as retry_exc:
                emit({"error": "reinit failed: " + str(retry_exc), "on-deck": False, "valid": False})
                time.sleep_ms(1000)

        time.sleep_ms(SAMPLE_INTERVAL_MS)


main()
