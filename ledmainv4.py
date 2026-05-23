from machine import Pin, I2C
from time import sleep_ms, ticks_ms, ticks_diff
from vl53l0x import VL53L0X, VL53L0XTimeoutError
import ssd1306
import neopixel


# =========================
# Pin Config
# =========================

TOF_SDA = 21
TOF_SCL = 22

OLED_SDA = 12
OLED_SCL = 14

BUTTON_PIN = 19
BUTTON_ACTIVE_LEVEL = 0

LED_PIN = 18
LED_COUNT = 30

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

button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

print("TOF I2C scan:", [hex(x) for x in i2c_tof.scan()])
print("OLED I2C scan:", [hex(x) for x in i2c_oled.scan()])

tof = VL53L0X(i2c_tof)

oled = ssd1306.SSD1306_I2C(
    OLED_WIDTH,
    OLED_HEIGHT,
    i2c_oled,
    addr=OLED_ADDR
)

np = neopixel.NeoPixel(Pin(LED_PIN, Pin.OUT), LED_COUNT)


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
# RGB LED UI
# =========================

LED_UPDATE_INTERVAL_MS = 50
last_led_update_time = 0

COLOR_OFF = (0, 0, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_AMBER = (255, 120, 0)
COLOR_STANDBY = (180, 170, 140)

GRADIENT_COLORS = [
    (255, 100, 160),
    (255, 145, 70),
    (255, 220, 70),
    (130, 255, 110),
    (70, 255, 210),
    (80, 220, 255),
    (120, 150, 255),
    (190, 120, 255),
    (255, 110, 235),
]

current_leds = []

for _ in range(LED_COUNT):
    current_leds.append((0, 0, 0))


def scale_color(color, brightness):
    r, g, b = color

    if brightness < 0:
        brightness = 0

    if brightness > 255:
        brightness = 255

    return (
        r * brightness // 255,
        g * brightness // 255,
        b * brightness // 255
    )


def blend_color(c1, c2, t):
    if t < 0:
        t = 0

    if t > 255:
        t = 255

    return (
        c1[0] + (c2[0] - c1[0]) * t // 255,
        c1[1] + (c2[1] - c1[1]) * t // 255,
        c1[2] + (c2[2] - c1[2]) * t // 255
    )


def gradient_color(index, total, brightness, shift=0):
    if total <= 1:
        return scale_color(GRADIENT_COLORS[0], brightness)

    color_count = len(GRADIENT_COLORS)

    pos = (index * 256 * color_count // total + shift) % (256 * color_count)

    segment = pos // 256
    next_segment = (segment + 1) % color_count
    local_t = pos % 256

    color = blend_color(
        GRADIENT_COLORS[segment],
        GRADIENT_COLORS[next_segment],
        local_t
    )

    return scale_color(color, brightness)


def wheel(pos):
    pos = pos % 255

    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)

    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)

    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)


def step_channel(current, target, step):
    if current < target:
        current += step
        if current > target:
            current = target
    elif current > target:
        current -= step
        if current < target:
            current = target

    return current


def led_apply_target(target_leds, fade_step=18):
    global current_leds

    for i in range(LED_COUNT):
        cr, cg, cb = current_leds[i]
        tr, tg, tb = target_leds[i]

        nr = step_channel(cr, tr, fade_step)
        ng = step_channel(cg, tg, fade_step)
        nb = step_channel(cb, tb, fade_step)

        current_leds[i] = (nr, ng, nb)
        np[i] = (nr, ng, nb)

    np.write()


def led_target_solid(color):
    target = []

    for _ in range(LED_COUNT):
        target.append(color)

    return target


def led_clear():
    led_apply_target(led_target_solid(COLOR_OFF), fade_step=40)


def make_undocked_target(now):
    # 待机状态：极低亮度纯色，不闪、不渐变
    color = scale_color(COLOR_STANDBY, 8)
    return led_target_solid(color)


def make_starting_target(now):
    target = []

    if starting_start_time is None:
        progress = 0
        shift = 0
    else:
        elapsed = ticks_diff(now, starting_start_time)
        progress = elapsed * LED_COUNT // 1500
        shift = elapsed // 8

    if progress < 0:
        progress = 0

    if progress > LED_COUNT:
        progress = LED_COUNT

    for i in range(LED_COUNT):
        if i < progress:
            target.append(gradient_color(i, LED_COUNT, 150, shift))
        else:
            target.append(gradient_color(i, LED_COUNT, 12, shift))

    return target


def make_focusing_target(now):
    target = []

    if focus_start_time is None:
        progress = 0
        shift = 0
    else:
        elapsed_ms = ticks_diff(now, focus_start_time)
        total_ms = FOCUS_SECONDS * 1000

        if total_ms <= 0:
            progress = LED_COUNT
        else:
            progress = elapsed_ms * LED_COUNT // total_ms

        shift = elapsed_ms // 80

    if progress < 0:
        progress = 0

    if progress > LED_COUNT:
        progress = LED_COUNT

    for i in range(LED_COUNT):
        if i < progress:
            target.append(gradient_color(i, LED_COUNT, 170, shift))
        else:
            target.append(gradient_color(i, LED_COUNT, 24, shift))

    if progress < LED_COUNT:
        pulse = (now // 120) % 6

        if pulse <= 2:
            highlight_brightness = 235
        else:
            highlight_brightness = 150

        highlight = gradient_color(progress, LED_COUNT, highlight_brightness, shift)
        white_mix = scale_color(COLOR_WHITE, 55)

        target[progress] = (
            min(highlight[0] + white_mix[0], 255),
            min(highlight[1] + white_mix[1], 255),
            min(highlight[2] + white_mix[2], 255)
        )

    return target


def make_break_target(now):
    target = []

    shift = (now // 60) % 256
    pos = (now // 100) % LED_COUNT

    for i in range(LED_COUNT):
        target.append(gradient_color(i, LED_COUNT, 18, shift))

    for offset in range(7):
        index = (pos + offset) % LED_COUNT
        brightness = 145 - offset * 16

        if brightness < 35:
            brightness = 35

        target[index] = gradient_color(index, LED_COUNT, brightness, shift)

    return target


def make_sync_lost_target(now):
    target = []

    if remove_start_time is None:
        elapsed = 0
    else:
        elapsed = ticks_diff(now, remove_start_time)

    progress = elapsed * LED_COUNT // REMOVE_CONFIRM_MS

    if progress < 1:
        progress = 1

    if progress > LED_COUNT:
        progress = LED_COUNT

    for i in range(LED_COUNT):
        if i < progress:
            target.append(scale_color(COLOR_AMBER, 145))
        else:
            target.append(scale_color(COLOR_AMBER, 14))

    return target


def make_return_buffer_target(now):
    target = []

    if return_buffer_start_time is None:
        remain = RETURN_BUFFER_SECONDS
    else:
        elapsed_s = ticks_diff(now, return_buffer_start_time) // 1000
        remain = RETURN_BUFFER_SECONDS - elapsed_s

    if remain < 0:
        remain = 0

    lit = remain * LED_COUNT // RETURN_BUFFER_SECONDS

    if lit < 0:
        lit = 0

    if lit > LED_COUNT:
        lit = LED_COUNT

    phase = (now // 300) % 2

    for i in range(LED_COUNT):
        if i < lit:
            target.append(scale_color(COLOR_AMBER, 80))
        else:
            target.append(scale_color(COLOR_AMBER, 10))

    if phase == 0:
        target[0] = scale_color(COLOR_AMBER, 165)
        target[LED_COUNT - 1] = scale_color(COLOR_AMBER, 165)

    return target


def make_done_target(now):
    target = []

    shift = (now // 18) % 255

    for i in range(LED_COUNT):
        color = wheel(shift + i * 12)
        target.append(scale_color(color, 145))

    return target


def update_leds(now):
    global last_led_update_time

    if ticks_diff(now, last_led_update_time) < LED_UPDATE_INTERVAL_MS:
        return

    last_led_update_time = now

    fade_step = 18

    if remove_start_time is not None and ui_state == "focusing" and not basic_mode:
        target = make_sync_lost_target(now)
        fade_step = 22
    elif ui_state == "undocked":
        target = make_undocked_target(now)
        fade_step = 10
    elif ui_state == "starting":
        target = make_starting_target(now)
        fade_step = 20
    elif ui_state == "basic_starting":
        target = make_starting_target(now)
        fade_step = 20
    elif ui_state == "focusing":
        target = make_focusing_target(now)
        fade_step = 55
    elif ui_state == "break":
        target = make_break_target(now)
        fade_step = 16
    elif ui_state == "return_buffer":
        target = make_return_buffer_target(now)
        fade_step = 18
    elif ui_state == "sync_lost":
        target = make_sync_lost_target(now)
        fade_step = 22
    elif ui_state == "done":
        target = make_done_target(now)
        fade_step = 35
    else:
        target = led_target_solid(COLOR_OFF)
        fade_step = 25

    led_apply_target(target, fade_step)


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
# Button Config
# =========================

BUTTON_DEBOUNCE_MS = 250
BOOT_IGNORE_MS = 1000

boot_time = ticks_ms()
last_button_value = button.value()
last_button_trigger_time = ticks_ms()


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
basic_mode = False

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

    elif new_state == "basic_starting":
        starting_start_time = now
        focus_start_time = None
        break_start_time = None
        return_buffer_start_time = None
        oled_two_lines("Basic mode", "Starting...")

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

    if remove_start_time is not None and ui_state == "focusing" and not basic_mode:
        return

    if ui_state == "starting":
        if starting_start_time is not None:
            if ticks_diff(now, starting_start_time) >= 1500:
                set_ui_state("focusing")

    elif ui_state == "basic_starting":
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
            if basic_mode:
                if current_cycle < TOTAL_CYCLES:
                    current_cycle += 1
                    set_ui_state("focusing")
                else:
                    set_ui_state("done")
            else:
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


def check_button(now):
    global last_button_value
    global last_button_trigger_time
    global basic_mode
    global current_cycle
    global dock_placed
    global place_start_time
    global remove_start_time

    if ticks_diff(now, boot_time) < BOOT_IGNORE_MS:
        last_button_value = button.value()
        return

    current_button_value = button.value()

    pressed = current_button_value == BUTTON_ACTIVE_LEVEL
    last_pressed = last_button_value == BUTTON_ACTIVE_LEVEL

    if pressed and not last_pressed:
        if ticks_diff(now, last_button_trigger_time) >= BUTTON_DEBOUNCE_MS:
            last_button_trigger_time = now

            if not dock_placed and ui_state == "undocked" and not basic_mode:
                basic_mode = True
                current_cycle = 1
                place_start_time = None
                remove_start_time = None

                print("EVENT: button_start_basic_mode = True")
                set_ui_state("basic_starting")

    last_button_value = current_button_value


def handle_placed(now, raw, corrected):
    global dock_placed
    global place_start_time
    global remove_start_time

    if basic_mode:
        return

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
        ui_state,
        "| basic_mode:",
        basic_mode
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

    if basic_mode:
        dock_placed = False
        remove_start_time = None
        return

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
led_clear()


# =========================
# Main Loop
# =========================

while True:
    now = ticks_ms()

    check_button(now)

    if basic_mode:
        update_focus_screen()
        update_leds(now)
        sleep_ms(SAMPLE_INTERVAL_MS)
        continue

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
            update_leds(now)
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
                    dock_placed,
                    "| basic_mode:",
                    basic_mode
                )

        update_focus_screen()
        update_leds(now)

    except VL53L0XTimeoutError:
        handle_removed(
            now,
            raw=None,
            corrected=None,
            reason="timeout_as_removed"
        )

        update_focus_screen()
        update_leds(now)

    except OSError as e:
        print("I2C error:", e)

        handle_removed(
            now,
            raw=None,
            corrected=None,
            reason="i2c_error_as_removed"
        )

        update_focus_screen()
        update_leds(now)

    sleep_ms(SAMPLE_INTERVAL_MS)
