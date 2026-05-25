from machine import Pin, I2C
import network
import time
import ujson
import ubinascii
import uos
import neopixel

try:
    import ssd1306
except ImportError:
    ssd1306 = None

try:
    import usocket as socket
except ImportError:
    import socket

from vl53l0x_driver import VL53L0X


# ==================================================
# WiFi Config
# ==================================================

WIFI_SSID = "YOUR_WIFI_NAME"
WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"


# ==================================================
# WebSocket Config
# ==================================================

WS_HOST = "YOUR_SERVER_HOST"
WS_PORT = 80
WS_PATH = "/ws/device"

DEVICE_NAME = "anchor-beta-esp32"


# ==================================================
# Hardware Pins
# ==================================================

TOF_SDA = 21
TOF_SCL = 22

OLED_SDA = 12
OLED_SCL = 14

TOUCH_PIN = 19
TOUCH_ACTIVE_LEVEL = 1

LED_PIN = 18
LED_COUNT = 30


# ==================================================
# OLED Config
# ==================================================

OLED_WIDTH = 128
OLED_HEIGHT = 32
OLED_ADDR = 0x3C


# ==================================================
# VL53L0X Detection Parameters
# ==================================================

DISTANCE_OFFSET_MM = 40

PLACE_THRESHOLD_MM = 80
REMOVE_THRESHOLD_MM = 100

PLACE_CONFIRM_MS = 1000
REMOVE_CONFIRM_MS = 3000

SAMPLE_INTERVAL_MS = 50


# ==================================================
# Pomodoro / UI Parameters
# ==================================================

FOCUS_SECONDS = 25 * 60
BREAK_SECONDS = 5 * 60
RETURN_BUFFER_SECONDS = 60
TOTAL_CYCLES = 3

STARTING_MS = 1500
COMPLETE_DEBOUNCE_MS = 400


# ==================================================
# Test Parameters
# ==================================================
# 路演测试可以临时改成：
#
# FOCUS_SECONDS = 60
# BREAK_SECONDS = 15
# RETURN_BUFFER_SECONDS = 15


# ==================================================
# Global Hardware State
# ==================================================

dock_placed = False
touchPressed = False

place_start_time = None
remove_start_time = None

lastOnDeck = None
lastTouchPressed = False
lastCompleteMs = 0


# ==================================================
# UI State
# ==================================================

ui_state = "undocked"

current_cycle = 1

starting_start_time = None
focus_start_time = None
break_start_time = None
return_buffer_start_time = None

last_oled_line1 = ""
last_oled_line2 = ""

last_led_update_time = 0


# ==================================================
# Network State
# ==================================================

wlan = network.WLAN(network.STA_IF)

lastWifiCheckMs = 0
WIFI_CHECK_INTERVAL_MS = 3000

lastWsReconnectMs = 0
WS_RECONNECT_INTERVAL_MS = 3000


# ==================================================
# Hardware Init
# ==================================================

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

tof = VL53L0X(i2c_tof)
oled = None

if ssd1306 is not None:
    try:
        oled = ssd1306.SSD1306_I2C(
            OLED_WIDTH,
            OLED_HEIGHT,
            i2c_oled,
            addr=OLED_ADDR
        )
    except Exception as e:
        print("[OLED] Disabled:", e)
else:
    print("[OLED] Disabled: ssd1306.py not found")

touch = Pin(TOUCH_PIN, Pin.IN)

np = neopixel.NeoPixel(Pin(LED_PIN, Pin.OUT), LED_COUNT)


# ==================================================
# Time Helper
# ==================================================

def now_ms():
    return time.ticks_ms()


def diff_ms(current, old):
    return time.ticks_diff(current, old)


# ==================================================
# OLED
# ==================================================

def center_x(text):
    text = str(text)
    x = int((OLED_WIDTH - len(text) * 8) / 2)

    if x < 0:
        x = 0

    return x


def oled_two_lines(line1, line2=""):
    global last_oled_line1
    global last_oled_line2

    if oled is None:
        return

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

    m = seconds // 60
    s = seconds % 60

    return "{:02d}:{:02d}".format(m, s)


# ==================================================
# LED Colors
# ==================================================

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


# ==================================================
# LED Helper
# ==================================================

def scale_color(color, brightness):
    r, g, b = color

    return (
        int(r * brightness / 255),
        int(g * brightness / 255),
        int(b * brightness / 255)
    )


def blend_color(c1, c2, t):
    r1, g1, b1 = c1
    r2, g2, b2 = c2

    return (
        int(r1 + (r2 - r1) * t / 255),
        int(g1 + (g2 - g1) * t / 255),
        int(b1 + (b2 - b1) * t / 255)
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


def wheel(pos, brightness):
    pos = pos % 255

    if pos < 85:
        color = (255 - pos * 3, pos * 3, 0)
    elif pos < 170:
        pos -= 85
        color = (0, 255 - pos * 3, pos * 3)
    else:
        pos -= 170
        color = (pos * 3, 0, 255 - pos * 3)

    return scale_color(color, brightness)


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


def led_target_solid(color):
    target = []

    for _ in range(LED_COUNT):
        target.append(color)

    return target


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


def led_clear():
    led_apply_target(led_target_solid(COLOR_OFF), fade_step=40)


# ==================================================
# LED Effects
# ==================================================

def make_undocked_target(current):
    color = scale_color(COLOR_STANDBY, 5)
    return led_target_solid(color)


def make_starting_target(current):
    if starting_start_time is None:
        progress = 0
        shift = 0
    else:
        elapsed = diff_ms(current, starting_start_time)
        progress = elapsed * LED_COUNT // STARTING_MS
        shift = elapsed // 40

    if progress < 0:
        progress = 0

    if progress > LED_COUNT:
        progress = LED_COUNT

    target = []

    for i in range(LED_COUNT):
        if i < progress:
            target.append(gradient_color(i, LED_COUNT, 170, shift))
        else:
            target.append(gradient_color(i, LED_COUNT, 12, shift))

    return target


def make_focusing_target(current):
    target = []

    if focus_start_time is None:
        progress = 0
        elapsed_ms = 0
        shift = 0
    else:
        elapsed_ms = diff_ms(current, focus_start_time)
        total_ms = FOCUS_SECONDS * 1000

        if total_ms <= 0:
            progress = LED_COUNT
        else:
            progress = elapsed_ms * LED_COUNT // total_ms

        shift = elapsed_ms // 35

    if progress < 0:
        progress = 0

    if progress > LED_COUNT:
        progress = LED_COUNT

    scan_pos = (current // 90) % LED_COUNT

    for i in range(LED_COUNT):
        if i < progress:
            target.append(gradient_color(i, LED_COUNT, 210, shift))
        else:
            target.append(gradient_color(i, LED_COUNT, 8, shift))

    if progress < LED_COUNT:
        blink_phase = (current // 250) % 2

        if blink_phase == 0:
            base = gradient_color(progress, LED_COUNT, 255, shift)
            white = scale_color(COLOR_WHITE, 130)

            target[progress] = (
                min(base[0] + white[0], 255),
                min(base[1] + white[1], 255),
                min(base[2] + white[2], 255)
            )
        else:
            target[progress] = gradient_color(progress, LED_COUNT, 25, shift)

    if scan_pos >= progress:
        target[scan_pos] = gradient_color(scan_pos, LED_COUNT, 190, shift)

        tail_1 = scan_pos - 1
        tail_2 = scan_pos - 2

        if tail_1 >= progress and tail_1 >= 0:
            target[tail_1] = gradient_color(tail_1, LED_COUNT, 90, shift)

        if tail_2 >= progress and tail_2 >= 0:
            target[tail_2] = gradient_color(tail_2, LED_COUNT, 45, shift)

    return target


def make_break_target(current):
    target = []

    shift = (current // 60) % 256
    pos = (current // 100) % LED_COUNT

    for i in range(LED_COUNT):
        target.append(gradient_color(i, LED_COUNT, 18, shift))

    for t in range(7):
        index = (pos - t) % LED_COUNT
        brightness = 150 - t * 18

        if brightness < 25:
            brightness = 25

        target[index] = gradient_color(index, LED_COUNT, brightness, shift)

    return target


def make_sync_lost_target(current):
    target = []

    if remove_start_time is None:
        progress_ms = 0
    else:
        progress_ms = diff_ms(current, remove_start_time)

    lit = progress_ms * LED_COUNT // REMOVE_CONFIRM_MS

    if lit < 1:
        lit = 1

    if lit > LED_COUNT:
        lit = LED_COUNT

    blink = (current // 180) % 2

    for i in range(LED_COUNT):
        if i < lit:
            brightness = 170 if blink == 0 else 80
            target.append(scale_color(COLOR_AMBER, brightness))
        else:
            target.append(scale_color(COLOR_AMBER, 12))

    return target


def make_return_buffer_target(current):
    target = []

    if return_buffer_start_time is None:
        remain = RETURN_BUFFER_SECONDS
    else:
        elapsed = diff_ms(current, return_buffer_start_time) // 1000
        remain = RETURN_BUFFER_SECONDS - elapsed

    if remain < 0:
        remain = 0

    lit = remain * LED_COUNT // RETURN_BUFFER_SECONDS

    if lit < 0:
        lit = 0

    if lit > LED_COUNT:
        lit = LED_COUNT

    blink = (current // 400) % 2

    for i in range(LED_COUNT):
        if i < lit:
            target.append(scale_color(COLOR_AMBER, 65))
        else:
            target.append(scale_color(COLOR_AMBER, 8))

    if blink == 0:
        target[0] = scale_color(COLOR_AMBER, 160)
        target[LED_COUNT - 1] = scale_color(COLOR_AMBER, 160)

    return target


def make_done_target(current):
    target = []
    shift = (current // 18) % 255

    for i in range(LED_COUNT):
        target.append(wheel(i * 256 // LED_COUNT + shift, 145))

    return target


def update_leds(current):
    global last_led_update_time

    if diff_ms(current, last_led_update_time) < 50:
        return

    last_led_update_time = current

    if remove_start_time is not None and ui_state == "focusing":
        target = make_sync_lost_target(current)
        fade_step = 22

    elif ui_state == "undocked":
        target = make_undocked_target(current)
        fade_step = 10

    elif ui_state == "starting":
        target = make_starting_target(current)
        fade_step = 24

    elif ui_state == "focusing":
        target = make_focusing_target(current)
        fade_step = 80

    elif ui_state == "break":
        target = make_break_target(current)
        fade_step = 16

    elif ui_state == "return_buffer":
        target = make_return_buffer_target(current)
        fade_step = 18

    elif ui_state == "done":
        target = make_done_target(current)
        fade_step = 35

    else:
        target = led_target_solid(COLOR_OFF)
        fade_step = 30

    led_apply_target(target, fade_step)


# ==================================================
# UI State Machine
# ==================================================

def set_ui_state(new_state):
    global ui_state
    global starting_start_time
    global focus_start_time
    global break_start_time
    global return_buffer_start_time

    if ui_state == new_state:
        return

    ui_state = new_state
    current = now_ms()

    print("[UI] State:", ui_state)

    if new_state == "undocked":
        starting_start_time = None
        focus_start_time = None
        break_start_time = None
        return_buffer_start_time = None
        oled_two_lines("Undocked", "Start flow")

    elif new_state == "starting":
        starting_start_time = current
        oled_two_lines("Dock placed", "Starting...")

    elif new_state == "focusing":
        focus_start_time = current
        oled_two_lines("Focusing", format_time(FOCUS_SECONDS))

    elif new_state == "break":
        break_start_time = current
        oled_two_lines("Short break", format_time(BREAK_SECONDS))

    elif new_state == "return_buffer":
        return_buffer_start_time = current
        oled_two_lines("Dock phone", "01:00 left")

    elif new_state == "done":
        oled_two_lines("Niceeee!", "Lets gooo!")


def update_ui_timer():
    global current_cycle

    current = now_ms()

    if remove_start_time is not None and ui_state == "focusing":
        elapsed = diff_ms(current, remove_start_time)
        step = elapsed // 1000 + 1

        if step < 1:
            step = 1

        if step > 3:
            step = 3

        oled_two_lines("Sync lost", "Retrying {}/3".format(step))
        return

    if ui_state == "undocked":
        oled_two_lines("Undocked", "Start flow")

    elif ui_state == "starting":
        if starting_start_time is None:
            return

        if diff_ms(current, starting_start_time) >= STARTING_MS:
            set_ui_state("focusing")

    elif ui_state == "focusing":
        if focus_start_time is None:
            return

        elapsed = diff_ms(current, focus_start_time) // 1000
        remain = FOCUS_SECONDS - elapsed

        if remain <= 0:
            set_ui_state("break")
            return

        line2 = "{}  ({}/{})".format(
            format_time(remain),
            current_cycle,
            TOTAL_CYCLES
        )

        oled_two_lines("Focusing", line2)

    elif ui_state == "break":
        if break_start_time is None:
            return

        elapsed = diff_ms(current, break_start_time) // 1000
        remain = BREAK_SECONDS - elapsed

        if remain <= 0:
            if current_cycle >= TOTAL_CYCLES:
                set_ui_state("done")
                return

            current_cycle += 1

            if dock_placed:
                set_ui_state("focusing")
            else:
                set_ui_state("return_buffer")

            return

        oled_two_lines("Short break", format_time(remain))

    elif ui_state == "return_buffer":
        if return_buffer_start_time is None:
            return

        elapsed = diff_ms(current, return_buffer_start_time) // 1000
        remain = RETURN_BUFFER_SECONDS - elapsed

        if dock_placed:
            set_ui_state("focusing")
            return

        if remain <= 0:
            oled_two_lines("Still waiting", "Dock phone")
            return

        oled_two_lines("Dock phone", "{} left".format(format_time(remain)))

    elif ui_state == "done":
        oled_two_lines("Niceeee!", "Lets gooo!")


# ==================================================
# WiFi
# ==================================================

def setup_wifi():
    wlan.active(True)

    if wlan.isconnected():
        print("[WiFi] Already connected")
        print("[WiFi] IP:", wlan.ifconfig()[0])
        return

    print()
    print("[WiFi] Connecting to:", WIFI_SSID)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)

    start = now_ms()

    while not wlan.isconnected():
        if diff_ms(now_ms(), start) > 20000:
            print()
            print("[WiFi] Connect timeout, retrying...")

            try:
                wlan.disconnect()
            except Exception:
                pass

            time.sleep_ms(300)
            wlan.connect(WIFI_SSID, WIFI_PASSWORD)
            start = now_ms()

        print(".", end="")
        time.sleep_ms(250)

    print()
    print("[WiFi] Connected")
    print("[WiFi] IP:", wlan.ifconfig()[0])


def ensure_wifi():
    global lastWifiCheckMs

    current = now_ms()

    if diff_ms(current, lastWifiCheckMs) < WIFI_CHECK_INTERVAL_MS:
        return

    lastWifiCheckMs = current

    if not wlan.isconnected():
        print("[WiFi] Disconnected, reconnecting...")

        try:
            wlan.disconnect()
        except Exception:
            pass

        wlan.connect(WIFI_SSID, WIFI_PASSWORD)


# ==================================================
# Minimal WebSocket Client
# ==================================================

class SimpleWebSocketClient:
    def __init__(self, host, port, path):
        self.host = host
        self.port = port
        self.path = path
        self.sock = None
        self.connected = False

    def connect(self):
        self.close()

        print("[WS] Connecting to ws://{}:{}{}".format(
            self.host,
            self.port,
            self.path
        ))

        try:
            addr = socket.getaddrinfo(self.host, self.port)[0][-1]

            self.sock = socket.socket()
            self.sock.settimeout(5)
            self.sock.connect(addr)

            key = ubinascii.b2a_base64(uos.urandom(16)).strip().decode()

            request = (
                "GET {} HTTP/1.1\r\n"
                "Host: {}:{}\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Key: {}\r\n"
                "Sec-WebSocket-Version: 13\r\n"
                "\r\n"
            ).format(
                self.path,
                self.host,
                self.port,
                key
            )

            self.sock.send(request.encode())

            response = b""
            start = now_ms()

            while b"\r\n\r\n" not in response:
                if diff_ms(now_ms(), start) > 5000:
                    raise OSError("WebSocket handshake timeout")

                chunk = self.sock.recv(256)

                if not chunk:
                    raise OSError("WebSocket handshake failed")

                response += chunk

            if b" 101 " not in response and not response.startswith(b"HTTP/1.1 101"):
                print("[WS] Handshake rejected:")
                print(response)
                raise OSError("WebSocket handshake rejected")

            self.sock.settimeout(0)
            self.connected = True

            print("[WS] Connected")

            self.send_json({
                "type": "hello",
                "device": DEVICE_NAME
            })

            if dock_placed:
                print("[WS] Dock already placed, sync start")
                self.send_json({
                    "sig": "start"
                })

        except Exception as e:
            print("[WS] Connect failed:", e)
            self.close()

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass

        self.sock = None
        self.connected = False

    def send_json(self, obj):
        try:
            text = ujson.dumps(obj)
            self.send_text(text)
            print("[WS] Sent:", text)
            return True

        except Exception as e:
            print("[WS] Send failed:", e)
            self.close()
            return False

    def send_text(self, text):
        if not self.connected or not self.sock:
            raise OSError("WebSocket not connected")

        payload = text.encode()
        frame = self.make_frame(payload, opcode=0x1)
        self.sock.send(frame)

    def make_frame(self, payload, opcode=0x1):
        first_byte = 0x80 | opcode
        length = len(payload)
        mask_key = uos.urandom(4)

        if length < 126:
            header = bytes([
                first_byte,
                0x80 | length
            ])

        elif length < 65536:
            header = bytes([
                first_byte,
                0x80 | 126,
                (length >> 8) & 0xFF,
                length & 0xFF
            ])

        else:
            header = bytes([
                first_byte,
                0x80 | 127,
                0, 0, 0, 0,
                (length >> 24) & 0xFF,
                (length >> 16) & 0xFF,
                (length >> 8) & 0xFF,
                length & 0xFF
            ])

        masked = bytearray(length)

        for i in range(length):
            masked[i] = payload[i] ^ mask_key[i % 4]

        return header + mask_key + bytes(masked)

    def loop(self):
        if not self.connected or not self.sock:
            return

        try:
            header = self.sock.recv(2)

            if not header:
                return

            if len(header) < 2:
                return

            b1 = header[0]
            b2 = header[1]

            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F

            self.sock.settimeout(0.2)

            if length == 126:
                ext = self.recv_exact(2)
                length = (ext[0] << 8) | ext[1]

            elif length == 127:
                ext = self.recv_exact(8)
                length = 0

                for b in ext:
                    length = (length << 8) | b

            mask_key = None

            if masked:
                mask_key = self.recv_exact(4)

            payload = self.recv_exact(length) if length > 0 else b""

            if masked and mask_key:
                data = bytearray(length)

                for i in range(length):
                    data[i] = payload[i] ^ mask_key[i % 4]

                payload = bytes(data)

            self.sock.settimeout(0)

            if opcode == 0x8:
                print("[WS] Server closed")
                self.close()

            elif opcode == 0x9:
                print("[WS] Ping")
                self.send_pong(payload)

            elif opcode == 0x1:
                try:
                    text = payload.decode()
                    print("[WS] Received:", text)
                    handle_server_message(text)
                except Exception:
                    print("[WS] Received text frame")

        except OSError:
            try:
                self.sock.settimeout(0)
            except Exception:
                pass

        except Exception as e:
            print("[WS] Loop error:", e)
            self.close()

    def recv_exact(self, n):
        data = b""

        while len(data) < n:
            chunk = self.sock.recv(n - len(data))

            if not chunk:
                raise OSError("Socket closed")

            data += chunk

        return data

    def send_pong(self, payload=b""):
        if not self.connected or not self.sock:
            return

        try:
            frame = self.make_frame(payload, opcode=0xA)
            self.sock.send(frame)
            print("[WS] Pong")

        except Exception as e:
            print("[WS] Pong failed:", e)
            self.close()


ws = SimpleWebSocketClient(WS_HOST, WS_PORT, WS_PATH)


def ensure_websocket():
    global lastWsReconnectMs

    if ws.connected:
        return

    current = now_ms()

    if diff_ms(current, lastWsReconnectMs) < WS_RECONNECT_INTERVAL_MS:
        return

    lastWsReconnectMs = current

    if not wlan.isconnected():
        print("[WS] WiFi not connected, skip reconnect")
        return

    ws.connect()


# ==================================================
# WebSocket Signal Send
# ==================================================

def send_json_signal(sig):
    payload = {
        "sig": sig
    }

    if not ws.connected:
        print("[WS] Not connected, drop event:", payload)
        return False

    return ws.send_json(payload)


def handle_server_message(text):
    try:
        msg = ujson.loads(text)
    except Exception:
        return

    cmd = msg.get("cmd")

    if cmd == "play":
        if ui_state in ("undocked", "starting", "return_buffer"):
            set_ui_state("focusing")

    elif cmd == "congrats":
        message = msg.get("message", "Great job!")
        oled_two_lines("Completed!", str(message)[:16])
        set_ui_state("done")

    elif cmd == "rest":
        oled_two_lines("Short break", "Relax")
        set_ui_state("break")


# ==================================================
# VL53L0X Dock Detection
# ==================================================

def correct_distance(raw):
    corrected = raw - DISTANCE_OFFSET_MM

    if corrected < 0:
        corrected = 0

    return corrected


def update_dock_state():
    global dock_placed
    global place_start_time
    global remove_start_time

    current = now_ms()

    try:
        raw = tof.read()

        if raw is None or raw <= 0 or raw > 2000:
            is_near = False
            corrected = None
            reason = "invalid_as_removed"

        else:
            corrected = correct_distance(raw)

            if corrected <= PLACE_THRESHOLD_MM:
                is_near = True
                reason = "near"

            elif corrected >= REMOVE_THRESHOLD_MM:
                is_near = False
                reason = "far"

            else:
                is_near = dock_placed
                reason = "middle_keep"

    except OSError as e:
        raw = None
        corrected = None
        is_near = False
        err_text = str(e)
        if "timeout" in err_text:
            reason = "timeout_as_removed"
        else:
            reason = "i2c_error_as_removed"
        print("[TOF] read error:", e)

    if is_near:
        remove_start_time = None

        if dock_placed:
            return

        if place_start_time is None:
            place_start_time = current
            print("[Dock] place checking... raw:", raw, "corrected:", corrected)
            return

        if diff_ms(current, place_start_time) >= PLACE_CONFIRM_MS:
            dock_placed = True
            place_start_time = None
            print("[Dock] placed stable")

    else:
        place_start_time = None

        if not dock_placed:
            return

        if remove_start_time is None:
            remove_start_time = current
            print("[Dock] remove checking... reason:", reason, "raw:", raw, "corrected:", corrected)
            return

        if diff_ms(current, remove_start_time) >= REMOVE_CONFIRM_MS:
            dock_placed = False
            remove_start_time = None
            print("[Dock] removed stable")


# ==================================================
# TTP223 Touch Detection
# ==================================================

def update_touch_state():
    global touchPressed

    touchPressed = touch.value() == TOUCH_ACTIVE_LEVEL


# ==================================================
# Event Logic
# ==================================================

def handle_dock_event(current_on_deck):
    global lastOnDeck
    global current_cycle

    if lastOnDeck is None:
        lastOnDeck = current_on_deck
        print("[Dock] Initial onDeck:", current_on_deck)

        if current_on_deck:
            print("[Event] initial start")
            send_json_signal("start")
            set_ui_state("starting")
        else:
            set_ui_state("undocked")

        return

    if current_on_deck == lastOnDeck:
        return

    lastOnDeck = current_on_deck

    if current_on_deck:
        print("[Event] start")
        send_json_signal("start")

        if ui_state in ("undocked", "return_buffer"):
            set_ui_state("starting")

    else:
        print("[Event] stop")
        send_json_signal("stop")

        if ui_state == "focusing":
            set_ui_state("undocked")
        elif ui_state == "starting":
            set_ui_state("undocked")
        elif ui_state == "done":
            set_ui_state("undocked")


def handle_touch_event(current_touch_pressed, current_on_deck):
    global lastTouchPressed
    global lastCompleteMs

    current = now_ms()

    touch_rising = current_touch_pressed and not lastTouchPressed
    lastTouchPressed = current_touch_pressed

    if not touch_rising:
        return

    if not current_on_deck:
        print("[Touch] pressed but phone not on deck, ignore")
        return

    if diff_ms(current, lastCompleteMs) < COMPLETE_DEBOUNCE_MS:
        print("[Touch] complete debounce ignored")
        return

    lastCompleteMs = current

    print("[Event] complete")
    send_json_signal("complete")
    set_ui_state("done")


# ==================================================
# Main
# ==================================================

def setup():
    print()
    print("====================================")
    print(" anchor-beta Full Hardware + WS Main")
    print("====================================")

    print("[Pin] VL53L0X SDA:", TOF_SDA, "SCL:", TOF_SCL)
    print("[Pin] OLED SDA:", OLED_SDA, "SCL:", OLED_SCL)
    print("[Pin] TTP223:", TOUCH_PIN)
    print("[Pin] WS2812:", LED_PIN, "count:", LED_COUNT)
    print("[WS] Host:", WS_HOST)
    print("[WS] Path:", WS_PATH)

    oled_two_lines("anchor-beta", "Booting...")
    led_clear()

    setup_wifi()

    oled_two_lines("WiFi OK", wlan.ifconfig()[0])

    ensure_websocket()

    set_ui_state("undocked")


def loop():
    current = now_ms()

    ensure_wifi()
    ensure_websocket()

    ws.loop()

    update_dock_state()
    update_touch_state()

    handle_dock_event(dock_placed)
    handle_touch_event(touchPressed, dock_placed)

    update_ui_timer()
    update_leds(current)

    time.sleep_ms(SAMPLE_INTERVAL_MS)


setup()

while True:
    loop()
