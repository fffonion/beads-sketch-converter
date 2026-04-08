#!/usr/bin/env python
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - dependency guard
    raise SystemExit(
        "Pillow is required. Install it with `python -m pip install pillow`."
    ) from exc


try:
    RESAMPLE_NEAREST = Image.Resampling.NEAREST
except AttributeError:  # pragma: no cover - Pillow < 9 compatibility
    RESAMPLE_NEAREST = Image.NEAREST


GRID_PATTERN = re.compile(r"\((\d+)\s*x\s*(\d+)\)")
DEFAULT_EXTENSIONS = (".png", ".jpg", ".jpeg", ".bmp", ".webp")


@dataclass
class AxisFit:
    start: float
    pitch: float
    score: float


@dataclass
class ImageResult:
    source_path: Path
    output_path: Path
    grid_width: int
    grid_height: int
    merged_colors: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove watermark dust from grid-based bead charts by replacing each "
            "cell with a single representative color."
        )
    )
    parser.add_argument(
        "input_dir",
        nargs="?",
        default=r"D:\fffonion\Downloads\拼豆图纸\bangboo",
        help="Folder that contains the source charts.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        default=r"D:\fffonion\Downloads\拼豆图纸\bangboo\clean",
        help="Folder for cleaned PNG files.",
    )
    parser.add_argument(
        "--grid-width",
        type=int,
        help="Fallback logical grid width for files whose names do not contain '(W x H)'.",
    )
    parser.add_argument(
        "--grid-height",
        type=int,
        help="Fallback logical grid height for files whose names do not contain '(W x H)'.",
    )
    parser.add_argument(
        "--scale",
        type=int,
        default=24,
        help="Nearest-neighbor output scale. Default: 24.",
    )
    parser.add_argument(
        "--trim-ratio",
        type=float,
        default=0.18,
        help="How much of each cell edge to ignore when sampling colors. Default: 0.18.",
    )
    parser.add_argument(
        "--merge-tolerance",
        type=int,
        default=18,
        help="Merge near-identical logical colors within this RGB tolerance. Default: 18.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing output files.",
    )
    args = parser.parse_args()

    if (args.grid_width is None) ^ (args.grid_height is None):
        parser.error("--grid-width and --grid-height must be provided together.")

    if args.grid_width is not None and (args.grid_width <= 0 or args.grid_height <= 0):
        parser.error("--grid-width and --grid-height must be positive integers.")

    if args.scale <= 0:
        parser.error("--scale must be positive.")

    if not 0.0 <= args.trim_ratio < 0.45:
        parser.error("--trim-ratio must be between 0.0 and 0.45.")

    if not 0 <= args.merge_tolerance <= 255:
        parser.error("--merge-tolerance must be between 0 and 255.")

    return args


def parse_grid_size(path: Path) -> Optional[Tuple[int, int]]:
    match = GRID_PATTERN.search(path.stem)
    if match is None:
        return None
    return int(match.group(1)), int(match.group(2))


def collect_input_files(input_dir: Path, output_dir: Path) -> List[Path]:
    files: List[Path] = []
    for path in sorted(input_dir.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in DEFAULT_EXTENSIONS:
            continue
        if path.parent == output_dir:
            continue
        files.append(path)
    return files


def rgb_to_gray(array: np.ndarray) -> np.ndarray:
    return (
        (array[..., 0] * 0.299)
        + (array[..., 1] * 0.587)
        + (array[..., 2] * 0.114)
    )


def axis_signal(rgb: np.ndarray, axis: str) -> np.ndarray:
    gray = rgb_to_gray(rgb.astype(np.float32))
    darkness = 255.0 - gray
    if axis == "x":
        return darkness.mean(axis=0)
    if axis == "y":
        return darkness.mean(axis=1)
    raise ValueError(axis)


def fit_axis(signal: np.ndarray, cell_count: int) -> AxisFit:
    axis_length = float(signal.size)
    expected_pitch = axis_length / float(cell_count)
    best = search_axis(signal, cell_count, expected_pitch * 0.78, expected_pitch * 1.22, 161, 321)
    best = refine_axis(signal, cell_count, best)
    return best


def search_axis(
    signal: np.ndarray,
    cell_count: int,
    min_pitch: float,
    max_pitch: float,
    pitch_steps: int,
    start_steps: int,
) -> AxisFit:
    coordinates = np.arange(signal.size, dtype=np.float32)
    best = AxisFit(start=0.0, pitch=max(min_pitch, 1.0), score=float("-inf"))

    for pitch in np.linspace(min_pitch, max_pitch, num=max(3, pitch_steps), dtype=np.float32):
        if pitch <= 1.0:
            continue
        span = float(pitch) * float(cell_count)
        max_start = float(signal.size - 1) - span
        if max_start < 0.0:
            continue

        starts = (
            np.array([0.0], dtype=np.float32)
            if max_start <= 0.0
            else np.linspace(0.0, max_start, num=max(3, start_steps), dtype=np.float32)
        )

        offsets = np.arange(cell_count + 1, dtype=np.float32)
        midpoint_offsets = np.arange(cell_count, dtype=np.float32) + 0.5

        for start in starts:
            boundaries = start + offsets * pitch
            midpoints = start + midpoint_offsets * pitch
            boundary_values = np.interp(boundaries, coordinates, signal)
            midpoint_values = np.interp(midpoints, coordinates, signal)
            score = float(boundary_values.mean() - midpoint_values.mean())
            if score > best.score:
                best = AxisFit(start=float(start), pitch=float(pitch), score=score)

    if best.score == float("-inf"):
        raise ValueError(f"Could not fit axis for {cell_count} cells.")

    return best


def refine_axis(signal: np.ndarray, cell_count: int, coarse: AxisFit) -> AxisFit:
    pitch_span = max(coarse.pitch * 0.08, 0.75)
    refined = search_axis(
        signal,
        cell_count,
        coarse.pitch - pitch_span,
        coarse.pitch + pitch_span,
        121,
        161,
    )

    start_span = max(refined.pitch * 0.5, 1.0)
    return search_axis_with_fixed_pitch(
        signal,
        cell_count,
        refined.pitch,
        refined.start - start_span,
        refined.start + start_span,
        241,
    )


def search_axis_with_fixed_pitch(
    signal: np.ndarray,
    cell_count: int,
    pitch: float,
    min_start: float,
    max_start: float,
    start_steps: int,
) -> AxisFit:
    coordinates = np.arange(signal.size, dtype=np.float32)
    max_valid_start = float(signal.size - 1) - (pitch * float(cell_count))
    clamped_min = max(0.0, min(min_start, max_valid_start))
    clamped_max = max(0.0, min(max_start, max_valid_start))
    if clamped_max < clamped_min:
        clamped_max = clamped_min

    starts = (
        np.array([clamped_min], dtype=np.float32)
        if np.isclose(clamped_min, clamped_max)
        else np.linspace(clamped_min, clamped_max, num=max(3, start_steps), dtype=np.float32)
    )

    offsets = np.arange(cell_count + 1, dtype=np.float32)
    midpoint_offsets = np.arange(cell_count, dtype=np.float32) + 0.5
    best = AxisFit(start=float(starts[0]), pitch=float(pitch), score=float("-inf"))

    for start in starts:
        boundaries = start + offsets * pitch
        midpoints = start + midpoint_offsets * pitch
        boundary_values = np.interp(boundaries, coordinates, signal)
        midpoint_values = np.interp(midpoints, coordinates, signal)
        score = float(boundary_values.mean() - midpoint_values.mean())
        if score > best.score:
            best = AxisFit(start=float(start), pitch=float(pitch), score=score)

    return best


def sample_cells(
    rgb: np.ndarray,
    fit_x: AxisFit,
    fit_y: AxisFit,
    trim_ratio: float,
) -> np.ndarray:
    grid_height = int(round((rgb.shape[0] - fit_y.start) / fit_y.pitch))
    grid_width = int(round((rgb.shape[1] - fit_x.start) / fit_x.pitch))
    logical = np.zeros((grid_height, grid_width, 3), dtype=np.uint8)

    for row in range(grid_height):
        y0 = fit_y.start + row * fit_y.pitch
        y1 = y0 + fit_y.pitch
        for column in range(grid_width):
            x0 = fit_x.start + column * fit_x.pitch
            x1 = x0 + fit_x.pitch
            logical[row, column] = estimate_cell_color(rgb, x0, y0, x1, y1, trim_ratio)

    return logical


def estimate_cell_color(
    rgb: np.ndarray,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    trim_ratio: float,
) -> np.ndarray:
    width = max(x1 - x0, 1.0)
    height = max(y1 - y0, 1.0)
    x_margin = width * trim_ratio
    y_margin = height * trim_ratio

    left = int(np.floor(x0 + x_margin))
    top = int(np.floor(y0 + y_margin))
    right = int(np.ceil(x1 - x_margin))
    bottom = int(np.ceil(y1 - y_margin))

    if right <= left:
        center_x = int(round((x0 + x1) / 2.0))
        left = max(0, center_x)
        right = min(rgb.shape[1], center_x + 1)

    if bottom <= top:
        center_y = int(round((y0 + y1) / 2.0))
        top = max(0, center_y)
        bottom = min(rgb.shape[0], center_y + 1)

    left = max(0, min(left, rgb.shape[1] - 1))
    top = max(0, min(top, rgb.shape[0] - 1))
    right = max(left + 1, min(right, rgb.shape[1]))
    bottom = max(top + 1, min(bottom, rgb.shape[0]))

    pixels = rgb[top:bottom, left:right].reshape(-1, 3).astype(np.float32)
    median = np.median(pixels, axis=0)
    distances = np.abs(pixels - median).sum(axis=1)
    keep_count = max(1, int(round(pixels.shape[0] * 0.65)))
    trimmed = pixels[np.argpartition(distances, keep_count - 1)[:keep_count]]
    color = np.median(trimmed, axis=0)
    return np.clip(np.rint(color), 0, 255).astype(np.uint8)


def merge_close_colors(logical: np.ndarray, tolerance: int) -> np.ndarray:
    if tolerance <= 0:
        return logical

    flat = logical.reshape(-1, 3)
    unique_colors, inverse, counts = np.unique(
        flat,
        axis=0,
        return_inverse=True,
        return_counts=True,
    )
    if unique_colors.shape[0] <= 1:
        return logical

    order = np.argsort(-counts)
    representatives: List[np.ndarray] = []
    representative_weights: List[float] = []
    mapping = np.zeros(unique_colors.shape[0], dtype=np.int32)

    for color_index in order:
        color = unique_colors[color_index].astype(np.float32)
        assigned = None
        for representative_index, representative in enumerate(representatives):
            if int(np.abs(color - representative).max()) <= tolerance:
                assigned = representative_index
                break

        if assigned is None:
            representatives.append(color.copy())
            representative_weights.append(float(counts[color_index]))
            assigned = len(representatives) - 1
        else:
            weight = representative_weights[assigned]
            color_weight = float(counts[color_index])
            representatives[assigned] = (
                (representatives[assigned] * weight) + (color * color_weight)
            ) / (weight + color_weight)
            representative_weights[assigned] = weight + color_weight

        mapping[color_index] = assigned

    merged_palette = np.zeros_like(unique_colors)
    for color_index in range(unique_colors.shape[0]):
        merged_palette[color_index] = np.clip(
            np.rint(representatives[mapping[color_index]]),
            0,
            255,
        ).astype(np.uint8)

    return merged_palette[inverse].reshape(logical.shape)


def render_output(logical: np.ndarray, scale: int) -> Image.Image:
    grid_height, grid_width, _ = logical.shape
    image = Image.fromarray(logical, mode="RGB")
    return image.resize((grid_width * scale, grid_height * scale), RESAMPLE_NEAREST)


def clean_image(
    source_path: Path,
    output_dir: Path,
    grid_width: int,
    grid_height: int,
    scale: int,
    trim_ratio: float,
    merge_tolerance: int,
    overwrite: bool,
) -> Optional[ImageResult]:
    output_path = output_dir / (source_path.stem + ".png")
    if output_path.exists() and not overwrite:
        return None

    with Image.open(source_path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)

    fit_x = fit_axis(axis_signal(rgb, "x"), grid_width)
    fit_y = fit_axis(axis_signal(rgb, "y"), grid_height)
    logical = sample_cells(rgb, fit_x, fit_y, trim_ratio)
    logical = merge_close_colors(logical, merge_tolerance)
    merged_colors = int(np.unique(logical.reshape(-1, 3), axis=0).shape[0])

    rendered = render_output(logical, scale)
    output_dir.mkdir(parents=True, exist_ok=True)
    rendered.save(output_path, format="PNG")

    return ImageResult(
        source_path=source_path,
        output_path=output_path,
        grid_width=grid_width,
        grid_height=grid_height,
        merged_colors=merged_colors,
    )


def resolve_grid_size(
    path: Path,
    fallback_grid: Optional[Tuple[int, int]],
) -> Optional[Tuple[int, int]]:
    parsed = parse_grid_size(path)
    if parsed is not None:
        return parsed
    return fallback_grid


def run_batch(args: argparse.Namespace) -> int:
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    fallback_grid = (
        (args.grid_width, args.grid_height)
        if args.grid_width is not None
        else None
    )

    if not input_dir.exists():
        raise SystemExit(f"Input folder not found: {input_dir}")

    processed_count = 0
    skipped: List[str] = []

    for source_path in collect_input_files(input_dir, output_dir):
        grid_size = resolve_grid_size(source_path, fallback_grid)
        if grid_size is None:
            skipped.append(f"{source_path.name}: missing '(W x H)' in file name.")
            continue

        try:
            result = clean_image(
                source_path=source_path,
                output_dir=output_dir,
                grid_width=grid_size[0],
                grid_height=grid_size[1],
                scale=args.scale,
                trim_ratio=args.trim_ratio,
                merge_tolerance=args.merge_tolerance,
                overwrite=args.overwrite,
            )
        except Exception as exc:  # pragma: no cover - runtime reporting
            skipped.append(f"{source_path.name}: {exc}")
            continue

        if result is None:
            print(f"Skip existing: {source_path.name}")
            continue

        processed_count += 1
        print(
            f"Cleaned: {result.source_path.name} -> {result.output_path.name} "
            f"({result.grid_width}x{result.grid_height}, {result.merged_colors} colors)"
        )

    for item in skipped:
        print(f"Skipped: {item}")

    print(f"Processed: {processed_count}")
    print(f"Output folder: {output_dir}")
    return 0 if processed_count > 0 else 1


def main() -> None:
    args = parse_args()
    raise SystemExit(run_batch(args))


if __name__ == "__main__":
    main()
