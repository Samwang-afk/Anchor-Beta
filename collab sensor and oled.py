from machine import Pin, I2C
from time import sleep_ms, ticks_ms, ticks_diff
from vl53l0x import VL53L0X, VL53L0XTimeoutError
import ssd1306


# =========================
# Pin Config
# =========================

TOF_SDA = 21
TOF_SCL = 22

OLED_SDA = 12
OLED_SCL = 14

OLED_WIDTH = 128
OLED_HEIGHT = 32
OLED_ADDR = 0x3C


# =========================
# I2C Init
# =========================

i2c_tof = I2C(
    0,
    sda=Pin(TOF_SDA),
    scl=Pin(TOF_SCL),
    freq=400000
)

i2c_oled = I2C(
    1,
    sda=Pin(OLED_SDA),
    scl=Pin(OLED_SCL),
    freq=400000
)

print("TOF I2C scan:", [hex(x) for x in i2c_tof.scan()])
print("OLED I2C scan:", [hex(x) for x in i2c_oled.scan()])

tof = VL53L0X(i2c_tof)

oled = ssd1306.SSD1306_I2C(
    OLED_WIDTH,
    OLED_HEIGHT,
    i2c_oled,
    addr=OLED_ADDR
)


# =========================
# OLED UI
# =========================

last_oled_line1 = None
last_oled_line2 = None


def center_x(text):
    text = str(text)
    x = int((OLED_WIDTH - len(text) * 8) / 2)

    if x < 0:
        x = 0

    return x


def oled_two_lines(line1, line2=""):
    global last_oled_line1
    global last_oled_line2

    line1 = str(line1)
    line2 = str(line2)

    if line1 == last_oled_line1 and line2 == last_oled_line2:
        return

    last_oled_line1 = line1
    last_oled_line2 = line2

    oled.fill(0)
    oled.text(line1, center_x(line1), 4)
    oled.text(line2, center_x(line2), 20)
    oled.show()


def format_time(seconds):
    if seconds < 0:
        seconds = 0

    minute = seconds // 60
    second = seconds % 60

    return "{:02d}:{:02d}".format(minute, second)


# =========================
# Dock Detection Config
# =========================

DISTANCE_OFFSET_MM = 40

PLACE_THRESHOLD_MM = 80
REMOVE_THRESHOLD_MM = 100

PLACE_CONFIRM_MS = 1000
REMOVE_CONFIRM_MS = 3000

SAMPLE_INTERVAL_MS = 100


# =========================
# Pomodoro Demo Config
# =========================

FOCUS_SECONDS = 25 * 60
BREAK_SECONDS = 5 * 60
RETURN_BUFFER_SECONDS = 60

TOTAL_CYCLES = 3

# Hackathon test:
# FOCUS_SECONDS = 30
# BREAK_SECONDS = 10
# RETURN_BUFFER_SECONDS = 15


# =========================
# State
# =========================

dock_placed = False

place_start_time = None
remove_start_time = None

ui_state = "undocked"

focus_start_time = None
break_start_time = None
starting_start_time = None
return_buffer_start_time = None

current_cycle = 1


def correct_distance(raw_mm):
    corrected = raw_mm - DISTANCE_OFFSET_MM

    if corrected < 0:
        corrected = 0

    return corrected


def set_ui_state(new_state):
    global ui_state
    global focus_start_time
    global break_start_time
    global starting_start_time
    global return_buffer_start_time

    now = ticks_ms()

    if ui_state == new_state:
        return

    ui_state = new_state

    if new_state == "undocked":
        focus_start_time = None
        break_start_time = None
        starting_start_time = None
        return_buffer_start_time = None
        oled_two_lines("Undocked", "Start flow")

    elif new_state == "starting":
        starting_start_time = now
        focus_start_time = None
        break_start_time = None
        return_buffer_start_time = None
        oled_two_lines("Dock placed", "Starting...")

    elif new_state == "focusing":
        focus_start_time = now
        break_start_time = None
        starting_start_time = None
        return_buffer_start_time = None

        oled_two_lines(
            "Focusing",
            "{}  ({}/{})".format(
                format_time(FOCUS_SECONDS),
                current_cycle,
                TOTAL_CYCLES
            )
        )

    elif new_state == "break":
        break_start_time = now
        focus_start_time = None
        starting_start_time = None
        return_buffer_start_time = None

        oled_two_lines(
            "Short break",
            format_time(BREAK_SECONDS)
        )

    elif new_state == "return_buffer":
        return_buffer_start_time = now
        focus_start_time = None
        break_start_time = None
        starting_start_time = None

        oled_two_lines(
            "Dock phone",
            "{} left".format(format_time(RETURN_BUFFER_SECONDS))
        )

    elif new_state == "sync_lost":
        oled_two_lines("Sync lost", "Retrying 1/3")

    elif new_state == "done":
        focus_start_time = None
        break_start_time = None
        starting_start_time = None
        return_buffer_start_time = None
        oled_two_lines("Niceeee!", "Lets gooo!")


def update_focus_screen():
    global current_cycle
    global return_buffer_start_time

    now = ticks_ms()

    if remove_start_time is not None and ui_state == "focusing":
        return

    if ui_state == "starting":
        if starting_start_time is not None:
            if ticks_diff(now, starting_start_time) >= 1500:
                set_ui_state("focusing")

    elif ui_state == "focusing":
        if focus_start_time is None:
            return

        elapsed_s = ticks_diff(now, focus_start_time) // 1000
        remain_s = FOCUS_SECONDS - elapsed_s

        oled_two_lines(
            "Focusing",
            "{}  ({}/{})".format(
                format_time(remain_s),
                current_cycle,
                TOTAL_CYCLES
            )
        )

        if remain_s <= 0:
            set_ui_state("break")

    elif ui_state == "break":
        if break_start_time is None:
            return

        elapsed_s = ticks_diff(now, break_start_time) // 1000
        remain_s = BREAK_SECONDS - elapsed_s

        oled_two_lines(
            "Short break",
            format_time(remain_s)
        )

        if remain_s <= 0:
            if dock_placed:
                if current_cycle < TOTAL_CYCLES:
                    current_cycle += 1
                    set_ui_state("focusing")
                else:
                    set_ui_state("done")
            else:
                set_ui_state("return_buffer")

    elif ui_state == "return_buffer":
        if return_buffer_start_time is None:
            return_buffer_start_time = now

        elapsed_s = ticks_diff(now, return_buffer_start_time) // 1000
        remain_s = RETURN_BUFFER_SECONDS - elapsed_s

        if dock_placed:
            if current_cycle < TOTAL_CYCLES:
                current_cycle += 1
                set_ui_state("focusing")
            else:
                set_ui_state("done")

            return

        if remain_s > 0:
            oled_two_lines(
                "Dock phone",
                "{} left".format(format_time(remain_s))
            )
        else:
            oled_two_lines(
                "Still waiting",
                "Dock phone"
            )


def handle_placed(now, raw, corrected):
    global dock_placed
    global place_start_time
    global remove_start_time

    remove_start_time = None

    if place_start_time is None:
        place_start_time = now

    place_elapsed = ticks_diff(now, place_start_time)

    print(
        "PLACE CHECK:",
        place_elapsed,
        "/",
        PLACE_CONFIRM_MS,
        "ms",
        "| raw:",
        raw,
        "| corrected:",
        corrected,
        "| dock_placed:",
        dock_placed,
        "| ui_state:",
        ui_state
    )

    if not dock_placed and place_elapsed >= PLACE_CONFIRM_MS:
        dock_placed = True
        place_start_time = None

        print("EVENT: dock_placed = True")

        if ui_state == "undocked":
            set_ui_state("starting")

        elif ui_state == "break":
            oled_two_lines("Short break", "Phone docked")

        elif ui_state == "return_buffer":
            oled_two_lines("Dock placed", "Resuming...")

        elif ui_state == "focusing":
            remove_start_time = None


def handle_removed(now, raw=None, corrected=None, reason="removed"):
    global dock_placed
    global place_start_time
    global remove_start_time

    place_start_time = None

    if ui_state == "break":
        dock_placed = False
        remove_start_time = None

        print(
            "BREAK REMOVED, IGNORED",
            "| raw:",
            raw,
            "| corrected:",
            corrected,
            "| reason:",
            reason,
            "| dock_placed:",
            dock_placed
        )

        return

    if ui_state == "return_buffer":
        dock_placed = False
        remove_start_time = None

        print(
            "RETURN BUFFER, WAITING PHONE",
            "| raw:",
            raw,
            "| corrected:",
            corrected,
            "| reason:",
            reason,
            "| dock_placed:",
            dock_placed
        )

        return

    if not dock_placed:
        remove_start_time = None
        set_ui_state("undocked")

        print(
            "REMOVED BUT ALREADY FALSE",
            "| raw:",
            raw,
            "| corrected:",
            corrected,
            "| reason:",
            reason,
            "| dock_placed:",
            dock_placed
        )

        return

    if remove_start_time is None:
        remove_start_time = now
        print("REMOVE TIMER START")

    remove_elapsed = ticks_diff(now, remove_start_time)
    retry_count = remove_elapsed // 1000 + 1

    if retry_count < 1:
        retry_count = 1

    if retry_count > 3:
        retry_count = 3

    oled_two_lines(
        "Sync lost",
        "Retrying {}/3".format(retry_count)
    )

    print(
        "REMOVE CHECK:",
        remove_elapsed,
        "/",
        REMOVE_CONFIRM_MS,
        "ms",
        "| raw:",
        raw,
        "| corrected:",
        corrected,
        "| reason:",
        reason,
        "| dock_placed:",
        dock_placed
    )

    if remove_elapsed >= REMOVE_CONFIRM_MS:
        dock_placed = False
        remove_start_time = None

        print("EVENT: dock_placed = False")

        set_ui_state("undocked")


# =========================
# Startup Screen
# =========================

oled_two_lines("Undocked", "Start flow")


# =========================
# Main Loop
# =========================

while True:
    now = ticks_ms()

    try:
        raw = tof.read_mm()

        if raw <= 0 or raw > 2000:
            handle_removed(
                now,
                raw=raw,
                corrected=None,
                reason="invalid_as_removed"
            )

            update_focus_screen()
            sleep_ms(SAMPLE_INTERVAL_MS)
            continue

        corrected = correct_distance(raw)

        if corrected <= PLACE_THRESHOLD_MM:
            handle_placed(now, raw, corrected)

        elif corrected >= REMOVE_THRESHOLD_MM:
            handle_removed(
                now,
                raw=raw,
                corrected=corrected,
                reason="far"
            )

        else:
            if dock_placed:
                handle_removed(
                    now,
                    raw=raw,
                    corrected=corrected,
                    reason="middle_as_removed"
                )
            else:
                set_ui_state("undocked")

                print(
                    "MIDDLE, STILL FALSE",
                    "| raw:",
                    raw,
                    "| corrected:",
                    corrected,
                    "| dock_placed:",
                    dock_placed
                )

        update_focus_screen()

    except VL53L0XTimeoutError:
        handle_removed(
            now,
            raw=None,
            corrected=None,
            reason="timeout_as_removed"
        )

        update_focus_screen()

    except OSError as e:
        print("I2C error:", e)

        handle_removed(
            now,
            raw=None,
            corrected=None,
            reason="i2c_error_as_removed"
        )

        update_focus_screen()

    sleep_ms(SAMPLE_INTERVAL_MS)
