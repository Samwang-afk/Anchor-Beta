# FocusDock VL53L0X Hardware Test

This note documents the current ESP32 + MicroPython distance sensor test for the FocusDock hardware MVP.

## Hardware

Required parts:

- ESP32 development board
- VL53L0X ToF distance sensor
- Dupont wires or breadboard jumpers
- USB data cable

The microphone module is not used.

## Wiring

| VL53L0X | ESP32 |
| --- | --- |
| VIN / VCC | 3V3 |
| GND | GND |
| SDA | GPIO21 |
| SCL | GPIO22 |

The sensor uses I2C. Do not connect it to TX/RX.

## Files

Upload both files in `hardware/micropython/` to the ESP32 root directory:

- `vl53l0x_driver.py`
- `distjudge.py`

Optional diagnostic script:

- `vl53l0x_diag.py`

If you want the test to run automatically after boot, upload `distjudge.py` as `main.py`.

## Behavior

`distjudge.py` prints one JSON line every 200ms:

```json
{"distance_mm":40,"corrected_mm":20,"filtered_mm":20,"close":true,"on-deck":true,"valid":true,"status":255,"raw_status":11}
```

Field meanings:

- `distance_mm`: raw VL53L0X reading
- `corrected_mm`: calibrated distance after subtracting the current offset
- `filtered_mm`: median-filtered corrected distance
- `close`: `true` when the calibrated distance is below `25mm`
- `on-deck`: `true` after `close` has stayed true for 1 second
- `valid`: `true` when the raw distance is in a plausible range
- `status` and `raw_status`: diagnostic values from the VL53L0X result register

State timing:

- Enter docked state: corrected distance below `25mm` continuously for `1000ms`
- Exit docked state: no longer close continuously for `3000ms`

## Calibration

Current bench calibration:

```python
RAW_COVERED_DISTANCE_MM = 40
CALIBRATED_COVERED_DISTANCE_MM = 20
```

This means a full sensor cover reads about `40mm` physically, but FocusDock treats that as logical `20mm`.

If your assembled dock reads a different value when the phone is placed on it, update `RAW_COVERED_DISTANCE_MM` in `distjudge.py`.

Examples:

- If docked phone reads `45mm`, set `RAW_COVERED_DISTANCE_MM = 45`.
- If docked phone reads `37mm`, set `RAW_COVERED_DISTANCE_MM = 37`.

## Expected Output

Sensor found:

```text
I2C scan: ['0x29']
ID: 0xee 0xaa 0x10
SPAD: 6 aperture: False
```

Phone or hand fully covering the sensor:

```json
{"distance_mm":40,"corrected_mm":20,"filtered_mm":20,"close":true,"on-deck":true,"valid":true,"status":255,"raw_status":11}
```

Out of range or invalid optical reading:

```json
{"distance_mm":8191,"corrected_mm":null,"filtered_mm":null,"on-deck":false,"valid":false,"status":255,"raw_status":11}
```

## Troubleshooting

If I2C scan does not show `0x29`, check VCC/GND/SDA/SCL wiring first.

If values are always `8191`, test with a white card 40-100mm above the sensor. If the white card works, the issue is likely reflection/angle/material, not I2C wiring.

If reconnecting USB causes repeated `8191`, run `vl53l0x_diag.py` once. It prints 30 raw measurements and a final `bad_count` summary.

If values are plausible but `on-deck` stays `false`, update `RAW_COVERED_DISTANCE_MM` to match the actual raw docked reading.

## Next Hardware Step

After this sensor test is stable, add the TTP223 touch module as the completion input. The expected future serial protocol is:

```json
{"sig":"start"}
{"sig":"stop"}
{"sig":"complete"}
```
