from machine import Pin, I2C
import time
from vl53l0x_driver import VL53L0X


SDA_PIN = 21
SCL_PIN = 22
I2C_FREQ = 100000
READ_COUNT = 30


def main():
    i2c = I2C(0, scl=Pin(SCL_PIN), sda=Pin(SDA_PIN), freq=I2C_FREQ)
    scan = i2c.scan()
    print("I2C scan:", [hex(x) for x in scan])

    if VL53L0X.ADDR not in scan:
        print("VL53L0X not found at 0x29")
        return

    sensor = VL53L0X(i2c, debug=True)
    bad_count = 0

    for idx in range(READ_COUNT):
        try:
            distance, status, raw_status = sensor.read_raw()
            if distance >= 8190:
                bad_count += 1
            print(
                "read",
                idx,
                "distance=",
                distance,
                "status=",
                status,
                "raw_status=",
                raw_status,
            )
        except Exception as exc:
            bad_count += 1
            print("read", idx, "error=", exc)
        time.sleep_ms(200)

    print("bad_count:", bad_count, "of", READ_COUNT)


main()
