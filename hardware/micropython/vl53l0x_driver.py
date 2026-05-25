from machine import I2C
import time


class VL53L0X:
    ADDR = 0x29

    STATUS_TRANSLATION = (
        255, 255, 255, 5, 2, 4, 1, 7,
        3, 0, 255, 255, 9, 13, 255, 255
    )

    def __init__(self, i2c, address=ADDR, timeout_ms=700, debug=False):
        self.i2c = i2c
        self.address = address
        self.timeout_ms = timeout_ms
        self.debug = debug
        self.stop_variable = 0
        self.init()

    def init(self):
        self._check_id()
        time.sleep_ms(50)

        self._w8(0x88, 0x00)
        self._w8(0x80, 0x01)
        self._w8(0xFF, 0x01)
        self._w8(0x00, 0x00)
        self.stop_variable = self._r8(0x91)
        self._w8(0x00, 0x01)
        self._w8(0xFF, 0x00)
        self._w8(0x80, 0x00)

        self._w8(0x60, self._r8(0x60) | 0x12)
        self._w16(0x44, int(0.25 * 128))

        self._w8(0x01, 0xFF)
        spad_count, spad_is_aperture = self._get_spad_info()
        if self.debug:
            print("SPAD:", spad_count, "aperture:", spad_is_aperture)

        spad_map = bytearray(self.i2c.readfrom_mem(self.address, 0xB0, 6))
        for reg, val in ((0xFF, 0x01), (0x4F, 0x00), (0x4E, 0x2C), (0xFF, 0x00), (0xB6, 0xB4)):
            self._w8(reg, val)

        first_spad = 12 if spad_is_aperture else 0
        enabled = 0
        for i in range(48):
            byte_i = i // 8
            bit_i = i % 8
            if i < first_spad or enabled == spad_count:
                spad_map[byte_i] &= ~(1 << bit_i)
            elif (spad_map[byte_i] >> bit_i) & 0x01:
                enabled += 1

        for i in range(6):
            self._w8(0xB0 + i, spad_map[i])

        self._load_tuning()

        self._w8(0x0A, 0x04)
        self._w8(0x84, self._r8(0x84) & ~0x10)
        self._w8(0x0B, 0x01)
        self._w8(0x01, 0xE8)

    def read(self):
        distance, status, raw_status = self.read_raw()
        if status == 0 and distance < 8190:
            return distance
        return None

    def read_raw(self):
        for reg, val in (
            (0x80, 0x01), (0xFF, 0x01), (0x00, 0x00), (0x91, self.stop_variable),
            (0x00, 0x01), (0xFF, 0x00), (0x80, 0x00), (0x00, 0x01),
        ):
            self._w8(reg, val)

        t0 = time.ticks_ms()
        while self._r8(0x00) & 0x01:
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError("timeout start clear")

        if not self._wait_ready(self.timeout_ms):
            raise OSError("timeout data ready")

        raw_status = (self._r8(0x14) >> 3) & 0x0F
        status = self.STATUS_TRANSLATION[raw_status]
        distance = self._r16(0x14 + 10)
        self._w8(0x0B, 0x01)
        return distance, status, raw_status

    def _check_id(self):
        c0, c1, c2 = self._r8(0xC0), self._r8(0xC1), self._r8(0xC2)
        if self.debug:
            print("ID:", hex(c0), hex(c1), hex(c2))
        if not (c0 == 0xEE and c1 == 0xAA and c2 == 0x10):
            raise OSError("not VL53L0X")

    def _get_spad_info(self):
        for reg, val in ((0x80, 0x01), (0xFF, 0x01), (0x00, 0x00), (0xFF, 0x06)):
            self._w8(reg, val)
        self._w8(0x83, self._r8(0x83) | 0x04)
        for reg, val in ((0xFF, 0x07), (0x81, 0x01), (0x80, 0x01), (0x94, 0x6B), (0x83, 0x00)):
            self._w8(reg, val)

        t0 = time.ticks_ms()
        while self._r8(0x83) == 0x00:
            if time.ticks_diff(time.ticks_ms(), t0) > self.timeout_ms:
                raise OSError("timeout get_spad_info")

        self._w8(0x83, 0x01)
        tmp = self._r8(0x92)
        count = tmp & 0x7F
        is_aperture = ((tmp >> 7) & 0x01) == 1

        for reg, val in ((0x81, 0x00), (0xFF, 0x06)):
            self._w8(reg, val)
        self._w8(0x83, self._r8(0x83) & ~0x04)
        for reg, val in ((0xFF, 0x01), (0x00, 0x01), (0xFF, 0x00), (0x80, 0x00)):
            self._w8(reg, val)

        return count, is_aperture

    def _wait_ready(self, timeout_ms):
        t0 = time.ticks_ms()
        while (self._r8(0x13) & 0x07) == 0:
            if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
                return False
        return True

    def _load_tuning(self):
        tuning = (
            (0xFF, 0x01), (0x00, 0x00), (0xFF, 0x00), (0x09, 0x00), (0x10, 0x00), (0x11, 0x00),
            (0x24, 0x01), (0x25, 0xFF), (0x75, 0x00), (0xFF, 0x01), (0x4E, 0x2C), (0x48, 0x00),
            (0x30, 0x20), (0xFF, 0x00), (0x30, 0x09), (0x54, 0x00), (0x31, 0x04), (0x32, 0x03),
            (0x40, 0x83), (0x46, 0x25), (0x60, 0x00), (0x27, 0x00), (0x50, 0x06), (0x51, 0x00),
            (0x52, 0x96), (0x56, 0x08), (0x57, 0x30), (0x61, 0x00), (0x62, 0x00), (0x64, 0x00),
            (0x65, 0x00), (0x66, 0xA0), (0xFF, 0x01), (0x22, 0x32), (0x47, 0x14), (0x49, 0xFF),
            (0x4A, 0x00), (0xFF, 0x00), (0x7A, 0x0A), (0x7B, 0x00), (0x78, 0x21), (0xFF, 0x01),
            (0x23, 0x34), (0x42, 0x00), (0x44, 0xFF), (0x45, 0x26), (0x46, 0x05), (0x40, 0x40),
            (0x0E, 0x06), (0x20, 0x1A), (0x43, 0x40), (0xFF, 0x00), (0x34, 0x03), (0x35, 0x44),
            (0xFF, 0x01), (0x31, 0x04), (0x4B, 0x09), (0x4C, 0x05), (0x4D, 0x04), (0xFF, 0x00),
            (0x44, 0x00), (0x45, 0x20), (0x47, 0x08), (0x48, 0x28), (0x67, 0x00), (0x70, 0x04),
            (0x71, 0x01), (0x72, 0xFE), (0x76, 0x00), (0x77, 0x00), (0xFF, 0x01), (0x0D, 0x01),
            (0xFF, 0x00), (0x80, 0x01), (0x01, 0xF8), (0xFF, 0x01), (0x8E, 0x01), (0x00, 0x01),
            (0xFF, 0x00), (0x80, 0x00),
        )
        for reg, val in tuning:
            self._w8(reg, val)

    def _w8(self, reg, val):
        self.i2c.writeto_mem(self.address, reg, bytes([val & 0xFF]))

    def _r8(self, reg):
        return self.i2c.readfrom_mem(self.address, reg, 1)[0]

    def _w16(self, reg, val):
        self.i2c.writeto_mem(self.address, reg, bytes([(val >> 8) & 0xFF, val & 0xFF]))

    def _r16(self, reg):
        data = self.i2c.readfrom_mem(self.address, reg, 2)
        return (data[0] << 8) | data[1]
