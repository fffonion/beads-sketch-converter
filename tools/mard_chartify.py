#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit(
        "Pillow is required. Install it with `python -m pip install pillow`."
    ) from exc


try:
    RESAMPLE_BOX = Image.Resampling.BOX
    RESAMPLE_LANCZOS = Image.Resampling.LANCZOS
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:  # pragma: no cover - Pillow < 9 compatibility
    RESAMPLE_BOX = Image.BOX
    RESAMPLE_LANCZOS = Image.LANCZOS
    RESAMPLE_NEAREST = Image.NEAREST


DEFAULT_PALETTE = Path(__file__).with_name("mard_palette_221.json")
DEFAULT_MIN_GRID_CELLS = 4
DEFAULT_MAX_GRID_CELLS = 512
GRID_SEPARATOR_COLOR = "#C9C4BC"
BOARD_FRAME_COLOR = "#111111"


@dataclass
class AxisGrid:
    period: int
    first_line: int
    last_line: int
    sequence_count: int


@dataclass
class DetectionResult:
    grid_width: int
    grid_height: int
    crop_box: Tuple[int, int, int, int]
    mode: str
    x_segments: Optional[List[Tuple[int, int]]] = None
    y_segments: Optional[List[Tuple[int, int]]] = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Match an image to the default 221-color MARD palette and render "
            "a labeled pixel-art chart."
        )
    )
    parser.add_argument("input_path", help="Input image path.")
    parser.add_argument(
        "-o",
        "--output",
        dest="output_path",
        help="Output image path. Defaults to <input>_mard_chart_<w>x<h>.png.",
    )
    parser.add_argument("--grid-width", type=int, help="Logical pixel-art width.")
    parser.add_argument("--grid-height", type=int, help="Logical pixel-art height.")
    parser.add_argument(
        "--palette-json",
        default=str(DEFAULT_PALETTE),
        help="Palette JSON file. Defaults to the bundled 221-color MARD palette.",
    )
    parser.add_argument(
        "--cell-size",
        type=int,
        help="Rendered cell size in the output chart. Defaults to an automatic value.",
    )
    parser.add_argument(
        "--reduce-tolerance",
        type=int,
        default=32,
        help=(
            "Photoshop-style color reduction tolerance (0-255). "
            "Colors within this tolerance are merged before palette matching. "
            "Default: 32."
        ),
    )
    parser.add_argument(
        "--no-reduce-colors",
        action="store_true",
        help="Disable the pre-palette color reduction step.",
    )
    parser.add_argument(
        "--no-pre-sharpen",
        action="store_true",
        help="Disable the mild pre-sharpen step for non-pixel-art inputs.",
    )
    parser.add_argument(
        "--pre-sharpen",
        type=int,
        default=20,
        help=(
            "Mild pre-sharpen strength for non-pixel-art inputs (0-100). "
            "Default: 20."
        ),
    )
    args = parser.parse_args()

    if (args.grid_width is None) ^ (args.grid_height is None):
        parser.error("--grid-width and --grid-height must be provided together.")

    if args.grid_width is not None and (args.grid_width <= 0 or args.grid_height <= 0):
        parser.error("--grid-width and --grid-height must be positive integers.")

    if args.cell_size is not None and args.cell_size <= 0:
        parser.error("--cell-size must be positive.")

    if not 0 <= args.reduce_tolerance <= 255:
        parser.error("--reduce-tolerance must be between 0 and 255.")
    if not 0 <= args.pre_sharpen <= 100:
        parser.error("--pre-sharpen must be between 0 and 100.")

    return args


def load_palette(path: Path) -> Tuple[List[str], np.ndarray]:
    palette_data = json.loads(path.read_text(encoding="utf-8"))
    labels = list(sorted(palette_data))
    colors = np.array([hex_to_rgb(palette_data[label]) for label in labels], dtype=np.uint8)
    return labels, colors


def hex_to_rgb(value: str) -> Tuple[int, int, int]:
    stripped = value.strip().lstrip("#")
    if len(stripped) != 6:
        raise ValueError(f"Unsupported HEX color: {value}")
    return tuple(int(stripped[index : index + 2], 16) for index in (0, 2, 4))


def parse_grid_hint_from_name(path: Path) -> Optional[Tuple[int, int]]:
    match = re.search(r"\((\d+)\s*x\s*(\d+)\)", path.stem, flags=re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def hinted_grid_is_close(
    detected_width: int,
    detected_height: int,
    hint_width: int,
    hint_height: int,
) -> bool:
    return (
        abs(detected_width - hint_width) <= 2
        and abs(detected_height - hint_height) <= 2
    )


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    rgb = np.asarray(rgb, dtype=np.float32) / 255.0
    linear = np.where(
        rgb <= 0.04045,
        rgb / 12.92,
        ((rgb + 0.055) / 1.055) ** 2.4,
    )

    x = (
        (linear[..., 0] * 0.4124564)
        + (linear[..., 1] * 0.3575761)
        + (linear[..., 2] * 0.1804375)
    )
    y = (
        (linear[..., 0] * 0.2126729)
        + (linear[..., 1] * 0.7151522)
        + (linear[..., 2] * 0.0721750)
    )
    z = (
        (linear[..., 0] * 0.0193339)
        + (linear[..., 1] * 0.1191920)
        + (linear[..., 2] * 0.9503041)
    )

    white = np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    xyz = np.stack((x, y, z), axis=-1) / white

    epsilon = 216 / 24389
    kappa = 24389 / 27
    f_xyz = np.where(
        xyz > epsilon,
        np.cbrt(xyz),
        (kappa * xyz + 16) / 116,
    )

    l = (116 * f_xyz[..., 1]) - 16
    a = 500 * (f_xyz[..., 0] - f_xyz[..., 1])
    b = 200 * (f_xyz[..., 1] - f_xyz[..., 2])
    return np.stack((l, a, b), axis=-1)


def detect_pixel_art(image: Image.Image) -> Optional[DetectionResult]:
    raw_detection = detect_raw_pixel_art(image)
    if raw_detection is not None:
        return raw_detection

    gridline_detection = detect_gridline_pixel_art(image)
    if gridline_detection is not None:
        return gridline_detection

    gapped_detection = detect_gapped_grid_pixel_art(image)
    if gapped_detection is not None:
        return gapped_detection

    block_detection = detect_block_pixel_art(image)
    if block_detection is not None:
        return block_detection

    return None


def detect_raw_pixel_art(image: Image.Image) -> Optional[DetectionResult]:
    width, height = image.size
    if width > 256 or height > 256:
        return None

    array = np.asarray(image.convert("RGB"))
    unique_colors = np.unique(array.reshape(-1, 3), axis=0).shape[0]
    pixel_count = width * height
    if unique_colors > min(4096, max(pixel_count // 2, 256)):
        return None

    return DetectionResult(
        grid_width=width,
        grid_height=height,
        crop_box=(0, 0, width, height),
        mode="raw-pixel-art",
    )


def detect_gridline_pixel_art(image: Image.Image) -> Optional[DetectionResult]:
    array = np.asarray(image.convert("RGB"), dtype=np.uint8)
    x_axis = detect_dark_axis_grid(array, axis="x")
    y_axis = detect_dark_axis_grid(array, axis="y")
    if x_axis is None or y_axis is None:
        return None

    width, height = image.size
    left_trim = max(x_axis.first_line, 0)
    top_trim = max(y_axis.first_line, 0)
    right_trim = max(width - 1 - x_axis.last_line, 0)

    crop_width = width - left_trim - right_trim
    crop_height = height - top_trim
    if crop_width <= 0 or crop_height <= 0:
        return None

    grid_width = int(round(crop_width / x_axis.period))
    grid_height = int(round(crop_height / y_axis.period))
    if not is_reasonable_grid(grid_width, grid_height):
        return None

    return DetectionResult(
        grid_width=grid_width,
        grid_height=grid_height,
        crop_box=(left_trim, top_trim, width - right_trim, height),
        mode="detected-gridlines",
    )


def detect_block_pixel_art(image: Image.Image) -> Optional[DetectionResult]:
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    x_signal = np.abs(array[:, 1:, :] - array[:, :-1, :]).mean(axis=(0, 2))
    y_signal = np.abs(array[1:, :, :] - array[:-1, :, :]).mean(axis=(1, 2))

    x_axis = detect_period_from_signal(x_signal, min_period=2)
    y_axis = detect_period_from_signal(y_signal, min_period=2)
    if x_axis is None or y_axis is None:
        return None

    width, height = image.size
    grid_width = int(round(width / x_axis.period))
    grid_height = int(round(height / y_axis.period))
    if not is_reasonable_grid(grid_width, grid_height):
        return None

    reconstructed = image.resize((grid_width, grid_height), RESAMPLE_BOX).resize(
        (width, height),
        RESAMPLE_NEAREST,
    )
    error = np.abs(
        np.asarray(image.convert("RGB"), dtype=np.float32)
        - np.asarray(reconstructed.convert("RGB"), dtype=np.float32)
    ).mean()
    if error > 35.0:
        return None

    return DetectionResult(
        grid_width=grid_width,
        grid_height=grid_height,
        crop_box=(0, 0, width, height),
        mode="detected-blocks",
    )


def detect_gapped_grid_pixel_art(image: Image.Image) -> Optional[DetectionResult]:
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    x_axis = detect_gapped_axis(array, axis="x")
    y_axis = detect_gapped_axis(array, axis="y")
    if x_axis is None or y_axis is None:
        return None

    grid_width = len(x_axis)
    grid_height = len(y_axis)
    if not is_reasonable_grid(grid_width, grid_height):
        return None

    crop_box = (
        x_axis[0][0],
        y_axis[0][0],
        x_axis[-1][1],
        y_axis[-1][1],
    )
    if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
        return None

    logical_image = sample_segments(image, x_axis, y_axis)
    reconstructed = logical_image.resize(
        (crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]),
        RESAMPLE_NEAREST,
    )
    reference = image.crop(crop_box).convert("RGB")
    error = np.abs(
        np.asarray(reference, dtype=np.float32)
        - np.asarray(reconstructed, dtype=np.float32)
    ).mean()
    if error > 55.0:
        return None

    return DetectionResult(
        grid_width=grid_width,
        grid_height=grid_height,
        crop_box=crop_box,
        mode="detected-gapped-grid",
        x_segments=x_axis,
        y_segments=y_axis,
    )


def detect_dark_axis_grid(array: np.ndarray, axis: str) -> Optional[AxisGrid]:
    if axis not in {"x", "y"}:
        raise ValueError(axis)

    if axis == "x":
        axis_length = array.shape[1]
        other_length = array.shape[0]
    else:
        axis_length = array.shape[0]
        other_length = array.shape[1]

    sample_length = max(min(int(other_length * 0.08), other_length - 1), 8)
    leading_signal = np.zeros(axis_length, dtype=np.float32)
    trailing_signal = np.zeros(axis_length, dtype=np.float32)

    for line in range(axis_length):
        if axis == "x":
            leading = array[: sample_length + 1, line, :]
            trailing = array[-(sample_length + 1) :, line, :]
        else:
            leading = array[line, : sample_length + 1, :]
            trailing = array[line, -(sample_length + 1) :, :]

        leading_dark = np.median(255.0 - rgb_to_gray(leading))
        trailing_dark = np.median(255.0 - rgb_to_gray(trailing))
        leading_signal[line] = leading_dark
        trailing_signal[line] = trailing_dark

    candidates = [
        build_axis_grid_from_signal(leading_signal, min_period=8),
        build_axis_grid_from_signal(trailing_signal, min_period=8),
        build_axis_grid_from_signal(np.minimum(leading_signal, trailing_signal), min_period=8),
    ]
    candidates = [candidate for candidate in candidates if candidate is not None]
    if not candidates:
        return None

    return max(
        candidates,
        key=lambda candidate: (candidate.sequence_count, candidate.last_line - candidate.first_line),
    )


def detect_gapped_axis(array: np.ndarray, axis: str) -> Optional[List[Tuple[int, int]]]:
    signal = build_edge_signal(array, axis)
    signal = smooth_signal(signal)
    axis_length = signal.size + 1
    period = dominant_autocorrelation_period(signal, min_period=3)
    if period is None:
        return None

    phase_scores = np.zeros(period, dtype=np.float32)
    phase_counts = np.zeros(period, dtype=np.int32)
    for index, value in enumerate(signal):
        phase = index % period
        phase_scores[phase] += float(value)
        phase_counts[phase] += 1
    phase_scores = np.divide(
        phase_scores,
        np.maximum(phase_counts, 1),
        out=np.zeros_like(phase_scores),
        where=phase_counts > 0,
    )

    cell_span = longest_low_phase_span(phase_scores)
    if cell_span is None:
        return None
    span_start, span_length = cell_span

    segments: List[Tuple[int, int]] = []
    current = span_start
    while current + span_length <= axis_length:
        if current >= 0:
            segments.append((current, current + span_length))
        current += period

    if len(segments) < DEFAULT_MIN_GRID_CELLS:
        return None

    trim_threshold = max(2, int(round(span_length * 0.8)))
    segments = [
        (start, end)
        for start, end in segments
        if start >= 0 and end <= axis_length and (end - start) >= trim_threshold
    ]
    if len(segments) < DEFAULT_MIN_GRID_CELLS:
        return None

    return segments


def detect_period_from_signal(signal: np.ndarray, min_period: int) -> Optional[AxisGrid]:
    return build_axis_grid_from_signal(signal, min_period=min_period)


def build_axis_grid_from_signal(signal: np.ndarray, min_period: int) -> Optional[AxisGrid]:
    if signal.size < min_period * 4:
        return None

    smoothed = smooth_signal(signal)
    threshold = max(float(smoothed.mean() + (smoothed.std() * 0.6)), float(smoothed.mean() + 3.0))
    candidates = local_maxima(smoothed, threshold)
    if len(candidates) < 4:
        return None

    diffs = [
        second - first
        for first, second in zip(candidates, candidates[1:])
        if second - first >= min_period
    ]
    period = dominant_period(diffs, min_period=min_period)
    if period is None:
        return None

    tolerance = max(int(round(period * 0.12)), 2)
    start_gap_threshold = max(period // 2, 2)
    sequence = longest_sequence(candidates, period, tolerance, start_gap_threshold)
    if len(sequence) < 4:
        return None

    return AxisGrid(
        period=period,
        first_line=sequence[0],
        last_line=sequence[-1],
        sequence_count=len(sequence),
    )


def smooth_signal(signal: np.ndarray) -> np.ndarray:
    if signal.size < 3:
        return signal.astype(np.float32)
    padded = np.pad(signal.astype(np.float32), (1, 1), mode="edge")
    kernel = np.array([0.25, 0.5, 0.25], dtype=np.float32)
    return np.convolve(padded, kernel, mode="valid")


def build_edge_signal(array: np.ndarray, axis: str) -> np.ndarray:
    if axis == "x":
        return np.abs(array[:, 1:, :] - array[:, :-1, :]).mean(axis=(0, 2))
    if axis == "y":
        return np.abs(array[1:, :, :] - array[:-1, :, :]).mean(axis=(1, 2))
    raise ValueError(axis)


def rgb_to_gray(rgb: np.ndarray) -> np.ndarray:
    return (
        (rgb[..., 0] * 0.299)
        + (rgb[..., 1] * 0.587)
        + (rgb[..., 2] * 0.114)
    )


def local_maxima(signal: np.ndarray, threshold: float) -> List[int]:
    maxima: List[int] = []
    for index in range(1, signal.size - 1):
        value = signal[index]
        if value < threshold:
            continue
        if value >= signal[index - 1] and value >= signal[index + 1]:
            maxima.append(index)
    return maxima


def dominant_period(diffs: Sequence[int], min_period: int) -> Optional[int]:
    if not diffs:
        return None

    counts = Counter(diffs)
    best_period: Optional[int] = None
    best_score = -1
    lower = max(min_period, min(diffs))
    upper = max(diffs)

    for period in range(lower, upper + 1):
        tolerance = max(int(round(period * 0.1)), 1)
        score = sum(
            count
            for diff, count in counts.items()
            if abs(diff - period) <= tolerance
        )
        if score > best_score:
            best_period = period
            best_score = score

    if best_period is None or best_score < 3:
        return None
    return best_period


def dominant_autocorrelation_period(
    signal: np.ndarray,
    min_period: int,
) -> Optional[int]:
    if signal.size < min_period * 4:
        return None

    centered = signal.astype(np.float32) - float(signal.mean())
    variance = float(np.dot(centered, centered))
    if variance <= 0:
        return None

    max_period = min(128, signal.size // 2)
    best_period = None
    best_score = -1.0
    scores: List[Tuple[int, float]] = []
    for period in range(min_period, max_period + 1):
        lhs = centered[:-period]
        rhs = centered[period:]
        denom = float(np.linalg.norm(lhs) * np.linalg.norm(rhs))
        if denom <= 0:
            continue
        score = float(np.dot(lhs, rhs) / denom)
        scores.append((period, score))
        if score > best_score:
            best_score = score
            best_period = period

    if best_period is None or best_score < 0.18:
        return None

    for divisor in range(2, 5):
        if best_period % divisor != 0:
            continue
        smaller_period = best_period // divisor
        for period, score in scores:
            if period == smaller_period and score >= max(0.18, best_score * 0.9):
                best_period = smaller_period
                best_score = score
                break

    near_best = [
        period
        for period, score in scores
        if score >= max(0.18, best_score * 0.92)
    ]
    return min(near_best) if near_best else best_period


def longest_low_phase_span(phase_scores: np.ndarray) -> Optional[Tuple[int, int]]:
    if phase_scores.size == 0:
        return None

    threshold = float(
        phase_scores.mean() + ((phase_scores.max() - phase_scores.mean()) * 0.4)
    )
    boundary_mask = phase_scores >= threshold
    if not np.any(boundary_mask):
        return None

    # Widen boundary bands slightly so line thickness does not leak into cells.
    boundary_mask = boundary_mask | np.roll(boundary_mask, 1) | np.roll(boundary_mask, -1)
    low_mask = ~boundary_mask
    if not np.any(low_mask):
        return None

    doubled = np.concatenate((low_mask, low_mask))
    best_start = None
    best_length = 0
    current_start = None
    current_length = 0

    for index, value in enumerate(doubled):
        if value:
            if current_start is None:
                current_start = index
                current_length = 1
            else:
                current_length += 1
            if current_length > best_length and current_length <= phase_scores.size:
                best_start = current_start
                best_length = current_length
        else:
            current_start = None
            current_length = 0

    if best_start is None or best_length < max(2, phase_scores.size // 3):
        return None

    return best_start % phase_scores.size, best_length


def longest_sequence(
    candidates: Sequence[int],
    period: int,
    tolerance: int,
    start_gap_threshold: int,
) -> List[int]:
    best: List[int] = []
    candidates = sorted(candidates)

    for start_index, start_line in enumerate(candidates):
        if start_index > 0:
            previous_gap = start_line - candidates[start_index - 1]
            if previous_gap < start_gap_threshold:
                continue

        sequence = [start_line]
        current_line = start_line
        current_index = start_index

        while True:
            target_line = current_line + period
            best_next_line = None
            best_next_index = None
            best_distance = sys.maxsize

            for next_index in range(current_index + 1, len(candidates)):
                candidate_line = candidates[next_index]
                if candidate_line > target_line + tolerance:
                    break
                distance = abs(candidate_line - target_line)
                if distance <= tolerance and distance < best_distance:
                    best_next_line = candidate_line
                    best_next_index = next_index
                    best_distance = distance

            if best_next_line is None or best_next_index is None:
                break

            sequence.append(best_next_line)
            current_line = best_next_line
            current_index = best_next_index

        if len(sequence) > len(best):
            best = sequence

    return best


def is_reasonable_grid(grid_width: int, grid_height: int) -> bool:
    return (
        DEFAULT_MIN_GRID_CELLS <= grid_width <= DEFAULT_MAX_GRID_CELLS
        and DEFAULT_MIN_GRID_CELLS <= grid_height <= DEFAULT_MAX_GRID_CELLS
    )


def crop_to_grid(image: Image.Image, detection: DetectionResult) -> Image.Image:
    return image.crop(detection.crop_box)


def sample_segments(
    image: Image.Image,
    x_segments: Sequence[Tuple[int, int]],
    y_segments: Sequence[Tuple[int, int]],
) -> Image.Image:
    array = np.asarray(image.convert("RGB"), dtype=np.float32)
    logical = np.zeros((len(y_segments), len(x_segments), 3), dtype=np.uint8)

    for row, (top, bottom) in enumerate(y_segments):
        for column, (left, right) in enumerate(x_segments):
            patch = array[top:bottom, left:right, :]
            if patch.size == 0:
                continue
            logical[row, column] = np.clip(np.rint(patch.mean(axis=(0, 1))), 0, 255).astype(np.uint8)

    return Image.fromarray(logical, mode="RGB")


def apply_sharpen(
    image: Image.Image,
    strength: int,
) -> Image.Image:
    if strength <= 0:
        return image.copy()
    radius = 0.85 + (strength / 100.0) * 0.45
    percent = 50 + int(strength * 2.0)
    threshold = 4
    return image.filter(
        ImageFilter.UnsharpMask(
            radius=radius,
            percent=percent,
            threshold=threshold,
        )
    )


def representative_color_from_patch(patch: np.ndarray) -> np.ndarray:
    pixels = patch.reshape(-1, 3)
    if pixels.size == 0:
        return np.array([255, 255, 255], dtype=np.uint8)

    quantized = (pixels // 16).astype(np.int32)
    codes = (quantized[:, 0] << 8) | (quantized[:, 1] << 4) | quantized[:, 2]
    unique_codes, counts = np.unique(codes, return_counts=True)
    dominant_code = int(unique_codes[counts.argmax()])
    mask = codes == dominant_code
    dominant_pixels = pixels[mask]
    representative = np.median(dominant_pixels, axis=0)
    return np.clip(np.rint(representative), 0, 255).astype(np.uint8)


def sample_regular_grid(
    image: Image.Image,
    grid_width: int,
    grid_height: int,
) -> Image.Image:
    array = np.asarray(image.convert("RGB"), dtype=np.uint8)
    y_edges = np.rint(np.linspace(0, array.shape[0], grid_height + 1)).astype(np.int32)
    x_edges = np.rint(np.linspace(0, array.shape[1], grid_width + 1)).astype(np.int32)
    logical = np.zeros((grid_height, grid_width, 3), dtype=np.uint8)

    for row in range(grid_height):
        top = int(y_edges[row])
        bottom = max(int(y_edges[row + 1]), top + 1)
        for column in range(grid_width):
            left = int(x_edges[column])
            right = max(int(x_edges[column + 1]), left + 1)
            patch = array[top:bottom, left:right, :]
            logical[row, column] = representative_color_from_patch(patch)

    return Image.fromarray(logical, mode="RGB")


def convert_image_to_logical_grid(
    image: Image.Image,
    grid_width: int,
    grid_height: int,
    pre_sharpen_enabled: bool,
    pre_sharpen_strength: int,
) -> Image.Image:
    cropped = center_crop_to_ratio(image, grid_width / grid_height)
    if pre_sharpen_enabled:
        cropped = apply_sharpen(cropped, pre_sharpen_strength)
    return sample_regular_grid(cropped, grid_width, grid_height)


def center_crop_to_ratio(image: Image.Image, target_ratio: float) -> Image.Image:
    width, height = image.size
    current_ratio = width / height
    if math.isclose(current_ratio, target_ratio, rel_tol=1e-6):
        return image

    if current_ratio > target_ratio:
        new_width = int(round(height * target_ratio))
        left = (width - new_width) // 2
        return image.crop((left, 0, left + new_width, height))

    new_height = int(round(width / target_ratio))
    top = (height - new_height) // 2
    return image.crop((0, top, width, top + new_height))


def match_palette(
    logical_image: Image.Image,
    palette_labels: Sequence[str],
    palette_rgb: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, List[str], Counter]:
    logical_rgb = np.asarray(logical_image.convert("RGB"), dtype=np.uint8)
    flat_rgb = logical_rgb.reshape(-1, 3)
    cell_lab = rgb_to_lab(flat_rgb)
    palette_lab = rgb_to_lab(palette_rgb)

    distances = ((cell_lab[:, None, :] - palette_lab[None, :, :]) ** 2).sum(axis=2)
    palette_indices = distances.argmin(axis=1)
    matched_rgb = palette_rgb[palette_indices].reshape(logical_rgb.shape)
    matched_labels = [palette_labels[index] for index in palette_indices]
    counts = Counter(matched_labels)
    return logical_rgb, matched_rgb, matched_labels, counts


def reduce_colors_photoshop_style(
    logical_image: Image.Image,
    tolerance: int,
) -> Tuple[Image.Image, int, int]:
    logical_rgb = np.asarray(logical_image.convert("RGB"), dtype=np.uint8)
    flat_rgb = logical_rgb.reshape(-1, 3)
    unique_rgb, inverse, counts = np.unique(
        flat_rgb,
        axis=0,
        return_inverse=True,
        return_counts=True,
    )

    original_unique_count = int(unique_rgb.shape[0])
    if tolerance <= 0 or original_unique_count <= 1:
        return logical_image.copy(), original_unique_count, original_unique_count

    sort_order = np.argsort(-counts)
    representatives: List[np.ndarray] = []
    representative_weights: List[float] = []
    color_to_cluster = np.zeros(original_unique_count, dtype=np.int32)

    for color_index in sort_order:
        color = unique_rgb[color_index].astype(np.float32)
        assigned_cluster = None

        for cluster_index, representative in enumerate(representatives):
            if int(np.abs(color - representative).max()) <= tolerance:
                assigned_cluster = cluster_index
                break

        if assigned_cluster is None:
            representatives.append(color.copy())
            representative_weights.append(float(counts[color_index]))
            assigned_cluster = len(representatives) - 1
        else:
            weight = representative_weights[assigned_cluster]
            color_weight = float(counts[color_index])
            representatives[assigned_cluster] = (
                (representatives[assigned_cluster] * weight) + (color * color_weight)
            ) / (weight + color_weight)
            representative_weights[assigned_cluster] = weight + color_weight

        color_to_cluster[color_index] = assigned_cluster

    reduced_palette = np.zeros_like(unique_rgb)
    for color_index in range(original_unique_count):
        representative = representatives[color_to_cluster[color_index]]
        reduced_palette[color_index] = np.clip(np.rint(representative), 0, 255).astype(np.uint8)

    reduced_rgb = reduced_palette[inverse].reshape(logical_rgb.shape)
    reduced_image = Image.fromarray(reduced_rgb, mode="RGB")
    reduced_unique_count = int(np.unique(reduced_rgb.reshape(-1, 3), axis=0).shape[0])
    return reduced_image, original_unique_count, reduced_unique_count


def choose_cell_size(grid_width: int, grid_height: int, requested: Optional[int]) -> int:
    if requested is not None:
        return requested

    largest = max(grid_width, grid_height)
    if largest <= 40:
        return 48
    if largest <= 64:
        return 36
    if largest <= 96:
        return 28
    if largest <= 128:
        return 22
    return 18


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                r"C:\Windows\Fonts\consolab.ttf",
                r"C:\Windows\Fonts\segoeuib.ttf",
                r"C:\Windows\Fonts\arialbd.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                r"C:\Windows\Fonts\consola.ttf",
                r"C:\Windows\Fonts\segoeui.ttf",
                r"C:\Windows\Fonts\arial.ttf",
            ]
        )

    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)

    return ImageFont.load_default()


def render_chart(
    matched_rgb: np.ndarray,
    matched_labels: Sequence[str],
    counts: Counter,
    output_path: Path,
    cell_size: int,
) -> None:
    grid_height, grid_width, _ = matched_rgb.shape
    cell_gap = max(1, cell_size // 18)
    frame = max(4, cell_size // 7)
    board_width = grid_width * cell_size
    board_height = grid_height * cell_size
    canvas_padding = max(24, cell_size)
    title_gap = max(16, cell_size // 2)

    label_font = load_font(max(10, int(cell_size * 0.34)), bold=True)
    title_font = load_font(max(16, int(cell_size * 0.5)), bold=True)
    legend_label_font = load_font(max(12, int(cell_size * 0.33)), bold=True)
    legend_count_font = load_font(max(12, int(cell_size * 0.28)))

    title = f"MARD 221 Colors - {grid_width} x {grid_height}"
    title_bbox = text_bbox(title_font, title)
    title_height = title_bbox[3] - title_bbox[1]

    legend_items = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    legend_tile_width = max(72, int(cell_size * 1.8))
    legend_swatch_height = max(38, int(cell_size * 0.95))
    legend_tile_height = legend_swatch_height + max(24, int(cell_size * 0.65))
    legend_gap = max(10, cell_size // 4)

    base_canvas_width = max(
        board_width + (canvas_padding * 2) + (frame * 2),
        900,
    )
    items_per_row = max(
        1,
        (base_canvas_width - (canvas_padding * 2) + legend_gap)
        // (legend_tile_width + legend_gap),
    )
    legend_rows = max(1, math.ceil(len(legend_items) / items_per_row))
    legend_height = legend_rows * legend_tile_height + max(0, legend_rows - 1) * legend_gap

    canvas_width = max(
        base_canvas_width,
        items_per_row * legend_tile_width + max(0, items_per_row - 1) * legend_gap + canvas_padding * 2,
    )
    canvas_height = (
        canvas_padding
        + title_height
        + title_gap
        + board_height
        + (frame * 2)
        + title_gap
        + legend_height
        + canvas_padding
    )

    canvas = Image.new("RGB", (canvas_width, canvas_height), "#F7F4EE")
    draw = ImageDraw.Draw(canvas)

    title_x = (canvas_width - (title_bbox[2] - title_bbox[0])) // 2
    title_y = canvas_padding
    draw.text((title_x, title_y), title, font=title_font, fill="#1C1C1C")

    board_outer_x = (canvas_width - (board_width + frame * 2)) // 2
    board_outer_y = title_y + title_height + title_gap
    board_inner_x = board_outer_x + frame
    board_inner_y = board_outer_y + frame

    draw.rectangle(
        (
            board_outer_x,
            board_outer_y,
            board_outer_x + board_width + frame * 2 - 1,
            board_outer_y + board_height + frame * 2 - 1,
        ),
        fill=BOARD_FRAME_COLOR,
    )

    index = 0
    for row in range(grid_height):
        for column in range(grid_width):
            x0 = board_inner_x + column * cell_size
            y0 = board_inner_y + row * cell_size
            x1 = x0 + cell_size - 1
            y1 = y0 + cell_size - 1
            fill_rgb = tuple(int(value) for value in matched_rgb[row, column])

            draw.rectangle((x0, y0, x1, y1), fill=fill_rgb)
            if cell_gap > 0:
                draw.rectangle((x0, y0, x1, y1), outline=GRID_SEPARATOR_COLOR, width=cell_gap)

            label = matched_labels[index]
            index += 1
            text_fill = choose_text_color(fill_rgb)
            draw_centered_text(
                draw,
                ((x0 + x1) // 2, (y0 + y1) // 2),
                label,
                font=label_font,
                fill=text_fill,
                stroke_fill=("#111111" if text_fill == "#FFFFFF" else "#FFFFFF"),
            )

    legend_top = board_outer_y + board_height + frame * 2 + title_gap
    legend_left = (canvas_width - min(len(legend_items), items_per_row) * legend_tile_width - max(0, min(len(legend_items), items_per_row) - 1) * legend_gap) // 2

    for item_index, (label, count) in enumerate(legend_items):
        row = item_index // items_per_row
        column = item_index % items_per_row
        item_x = legend_left + column * (legend_tile_width + legend_gap)
        item_y = legend_top + row * (legend_tile_height + legend_gap)

        fill_rgb = tuple(int(value) for value in matched_rgb.reshape(-1, 3)[matched_labels.index(label)])
        swatch_box = (
            item_x,
            item_y,
            item_x + legend_tile_width - 1,
            item_y + legend_swatch_height - 1,
        )
        draw.rounded_rectangle(
            swatch_box,
            radius=max(6, cell_size // 5),
            fill=fill_rgb,
            outline=BOARD_FRAME_COLOR,
            width=2,
        )
        draw_centered_text(
            draw,
            ((swatch_box[0] + swatch_box[2]) // 2, (swatch_box[1] + swatch_box[3]) // 2),
            label,
            font=legend_label_font,
            fill=choose_text_color(fill_rgb),
            stroke_fill=("#111111" if choose_text_color(fill_rgb) == "#FFFFFF" else "#FFFFFF"),
        )

        count_text = str(count)
        count_y = item_y + legend_swatch_height + max(6, cell_size // 6)
        count_width = text_bbox(legend_count_font, count_text)[2]
        draw.text(
            (item_x + (legend_tile_width - count_width) / 2, count_y),
            count_text,
            font=legend_count_font,
            fill="#2C2C2C",
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, format="PNG")


def choose_text_color(rgb: Tuple[int, int, int]) -> str:
    luminance = ((rgb[0] * 0.299) + (rgb[1] * 0.587) + (rgb[2] * 0.114)) / 255.0
    return "#FFFFFF" if luminance < 0.48 else "#111111"


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    center: Tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
    stroke_fill: str,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font, stroke_width=1)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    position = (center[0] - width / 2, center[1] - height / 2 - 1)
    draw.text(
        position,
        text,
        font=font,
        fill=fill,
        stroke_width=1,
        stroke_fill=stroke_fill,
    )


def text_bbox(font: ImageFont.ImageFont, text: str) -> Tuple[int, int, int, int]:
    probe = Image.new("RGB", (8, 8), "#FFFFFF")
    draw = ImageDraw.Draw(probe)
    return draw.textbbox((0, 0), text, font=font)


def default_output_path(input_path: Path, grid_width: int, grid_height: int) -> Path:
    return input_path.with_name(
        f"{input_path.stem}_mard_chart_{grid_width}x{grid_height}.png"
    )


def main() -> None:
    args = parse_args()
    input_path = Path(args.input_path).expanduser().resolve()
    palette_path = Path(args.palette_json).expanduser().resolve()

    if not input_path.exists():
        raise SystemExit(f"Input image not found: {input_path}")
    if not palette_path.exists():
        raise SystemExit(f"Palette file not found: {palette_path}")

    palette_labels, palette_rgb = load_palette(palette_path)
    grid_hint = parse_grid_hint_from_name(input_path)

    source_image = Image.open(input_path).convert("RGB")
    try:
        original_unique_colors = 0
        reduced_unique_colors = 0

        if args.grid_width is None:
            detection = detect_pixel_art(source_image)
            if detection is None:
                raise SystemExit(
                    "The image does not look like grid-based pixel art. "
                    "Provide --grid-width and --grid-height to pixelate it first."
                )

            if detection.x_segments is not None and detection.y_segments is not None:
                logical_image = sample_segments(
                    source_image,
                    detection.x_segments,
                    detection.y_segments,
                )
            else:
                working_image = crop_to_grid(source_image, detection)
                logical_image = working_image.resize(
                    (detection.grid_width, detection.grid_height),
                    RESAMPLE_BOX,
                )
            grid_width = detection.grid_width
            grid_height = detection.grid_height
            detection_mode = detection.mode

            if grid_hint is not None and hinted_grid_is_close(
                grid_width,
                grid_height,
                grid_hint[0],
                grid_hint[1],
            ) and (grid_width != grid_hint[0] or grid_height != grid_hint[1]):
                logical_image = logical_image.resize(grid_hint, RESAMPLE_BOX)
                grid_width, grid_height = grid_hint
                detection_mode = f"{detection_mode}+name-hint"
        else:
            grid_width = args.grid_width
            grid_height = args.grid_height
            logical_image = convert_image_to_logical_grid(
                source_image,
                grid_width,
                grid_height,
                pre_sharpen_enabled=not args.no_pre_sharpen,
                pre_sharpen_strength=args.pre_sharpen,
            )
            detection_mode = "converted-from-image"

        if args.no_reduce_colors:
            original_unique_colors = int(
                np.unique(
                    np.asarray(logical_image.convert("RGB"), dtype=np.uint8).reshape(-1, 3),
                    axis=0,
                ).shape[0]
            )
            reduced_unique_colors = original_unique_colors
        else:
            logical_image, original_unique_colors, reduced_unique_colors = reduce_colors_photoshop_style(
                logical_image,
                args.reduce_tolerance,
            )

        _, matched_rgb, matched_labels, counts = match_palette(
            logical_image,
            palette_labels,
            palette_rgb,
        )

        output_path = (
            Path(args.output_path).expanduser().resolve()
            if args.output_path
            else default_output_path(input_path, grid_width, grid_height)
        )

        render_chart(
            matched_rgb,
            matched_labels,
            counts,
            output_path,
            choose_cell_size(grid_width, grid_height, args.cell_size),
        )
    finally:
        source_image.close()

    print(f"Mode: {detection_mode}")
    print(f"Grid: {grid_width} x {grid_height}")
    if detection_mode == "converted-from-image":
        if args.no_pre_sharpen:
            print("Pre-sharpen: disabled")
        else:
            print(f"Pre-sharpen: {args.pre_sharpen}")
        print("Conversion: representative cell sampling")
    if args.no_reduce_colors:
        print(f"Color reduction: disabled ({original_unique_colors} logical colors)")
    else:
        print(
            "Color reduction: "
            f"tolerance={args.reduce_tolerance}, "
            f"logical colors {original_unique_colors} -> {reduced_unique_colors}"
        )
    print(f"Palette colors used: {len(counts)}")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
