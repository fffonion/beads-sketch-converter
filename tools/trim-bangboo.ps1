[CmdletBinding()]
param(
    [string]$SourceDirectory = 'D:\fffonion\Downloads\bangboo',
    [string]$OutputDirectory = 'D:\fffonion\Downloads\bangboo\output'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Get-ImageCodec {
    param(
        [System.Drawing.Imaging.ImageFormat]$Format
    )

    foreach ($Codec in [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()) {
        if ($Codec.FormatID -eq $Format.Guid) {
            return $Codec
        }
    }

    return $null
}

function Save-Image {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [string]$Path,
        [System.Drawing.Imaging.ImageFormat]$Format
    )

    $Codec = Get-ImageCodec -Format $Format
    if ($null -ne $Codec -and $Format.Guid -eq [System.Drawing.Imaging.ImageFormat]::Jpeg.Guid) {
        $EncoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
        $EncoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
            [System.Drawing.Imaging.Encoder]::Quality,
            [long]100
        )

        try {
            $Bitmap.Save($Path, $Codec, $EncoderParameters)
            return
        }
        finally {
            $EncoderParameters.Dispose()
        }
    }

    if ($null -ne $Codec) {
        $Bitmap.Save($Path, $Codec, $null)
        return
    }

    $Bitmap.Save($Path, $Format)
}

function Get-GridCount {
    param(
        [int]$Length,
        [int]$GridSize
    )

    if ($GridSize -le 0) {
        return 0
    }

    return [int][Math]::Round($Length / $GridSize, [MidpointRounding]::AwayFromZero)
}

function Get-OutputFileName {
    param(
        [string]$SourcePath,
        [int]$GridWidth,
        [int]$GridHeight
    )

    $baseName = [IO.Path]::GetFileNameWithoutExtension($SourcePath)
    $extension = [IO.Path]::GetExtension($SourcePath)

    if ($GridWidth -gt 0 -and $GridHeight -gt 0) {
        return "$baseName ($GridWidth x $GridHeight)$extension"
    }

    return "$baseName$extension"
}

function Get-GridAxisBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [ValidateSet('X', 'Y')]
        [string]$Axis
    )

    if ($Axis -eq 'X') {
        $axisLength = $Bitmap.Width
        $otherLength = $Bitmap.Height
    }
    else {
        $axisLength = $Bitmap.Height
        $otherLength = $Bitmap.Width
    }

    $sampleLength = [Math]::Max([Math]::Min([int]($otherLength * 0.08), $otherLength - 1), 8)
    $darknessByLine = [double[]]::new($axisLength)

    for ($line = 0; $line -lt $axisLength; $line++) {
        $leadingSamples = [double[]]::new($sampleLength + 1)
        $trailingSamples = [double[]]::new($sampleLength + 1)

        for ($index = 0; $index -le $sampleLength; $index++) {
            $reverseIndex = ($otherLength - 1) - $index

            if ($Axis -eq 'X') {
                $leadingColor = $Bitmap.GetPixel($line, $index)
                $trailingColor = $Bitmap.GetPixel($line, $reverseIndex)
            }
            else {
                $leadingColor = $Bitmap.GetPixel($index, $line)
                $trailingColor = $Bitmap.GetPixel($reverseIndex, $line)
            }

            $leadingGray = (0.299 * $leadingColor.R) + (0.587 * $leadingColor.G) + (0.114 * $leadingColor.B)
            $trailingGray = (0.299 * $trailingColor.R) + (0.587 * $trailingColor.G) + (0.114 * $trailingColor.B)
            $leadingSamples[$index] = 255 - $leadingGray
            $trailingSamples[$index] = 255 - $trailingGray
        }

        [Array]::Sort($leadingSamples)
        [Array]::Sort($trailingSamples)
        $leadingMedian = $leadingSamples[[int]($leadingSamples.Length / 2)]
        $trailingMedian = $trailingSamples[[int]($trailingSamples.Length / 2)]
        $darknessByLine[$line] = [Math]::Min($leadingMedian, $trailingMedian)
    }

    $averageDarkness = ($darknessByLine | Measure-Object -Average).Average
    $candidateLines = [System.Collections.Generic.List[int]]::new()

    for ($line = 2; $line -lt ($axisLength - 2); $line++) {
        $current = $darknessByLine[$line]
        if (
            $current -gt ($averageDarkness + 5) -and
            $current -ge $darknessByLine[$line - 1] -and
            $current -ge $darknessByLine[$line + 1] -and
            $current -ge $darknessByLine[$line - 2] -and
            $current -ge $darknessByLine[$line + 2]
        ) {
            $candidateLines.Add($line)
        }
    }

    if ($candidateLines.Count -lt 3) {
        return $null
    }

    $spacings = [System.Collections.Generic.List[int]]::new()
    for ($index = 1; $index -lt $candidateLines.Count; $index++) {
        $spacing = $candidateLines[$index] - $candidateLines[$index - 1]
        if ($spacing -ge 8) {
            $spacings.Add($spacing)
        }
    }

    if ($spacings.Count -eq 0) {
        return $null
    }

    $gridSize = [int](
        $spacings |
        Group-Object |
        Sort-Object -Property @{ Expression = 'Count'; Descending = $true }, @{ Expression = 'Name'; Descending = $false } |
        Select-Object -First 1 -ExpandProperty Name
    )

    $tolerance = [Math]::Max([int][Math]::Round($gridSize * 0.08), 2)
    $startGapThreshold = [Math]::Max([int][Math]::Floor($gridSize / 2), 2)
    $bestSequence = $null

    for ($startIndex = 0; $startIndex -lt $candidateLines.Count; $startIndex++) {
        if ($startIndex -gt 0) {
            $previousGap = $candidateLines[$startIndex] - $candidateLines[$startIndex - 1]
            if ($previousGap -lt $startGapThreshold) {
                continue
            }
        }

        $sequence = [System.Collections.Generic.List[int]]::new()
        $sequence.Add($candidateLines[$startIndex])
        $currentLine = $candidateLines[$startIndex]

        while ($true) {
            $targetLine = $currentLine + $gridSize
            $bestNextLine = $null
            $bestDistance = [int]::MaxValue

            for ($nextIndex = $startIndex + 1; $nextIndex -lt $candidateLines.Count; $nextIndex++) {
                $candidateLine = $candidateLines[$nextIndex]
                if ($candidateLine -le $currentLine) {
                    continue
                }

                $distance = [Math]::Abs($candidateLine - $targetLine)
                if ($distance -le $tolerance -and $distance -lt $bestDistance) {
                    $bestNextLine = $candidateLine
                    $bestDistance = $distance
                }

                if ($candidateLine -gt ($targetLine + $tolerance)) {
                    break
                }
            }

            if ($null -eq $bestNextLine) {
                break
            }

            $sequence.Add($bestNextLine)
            $currentLine = $bestNextLine
        }

        if ($null -eq $bestSequence -or $sequence.Count -gt $bestSequence.Count) {
            $bestSequence = $sequence
        }
    }

    if ($null -eq $bestSequence -or $bestSequence.Count -lt 3) {
        return $null
    }

    return [pscustomobject]@{
        GridSize = $gridSize
        FirstLine = $bestSequence[0]
        LastLine = $bestSequence[$bestSequence.Count - 1]
    }
}

function Trim-SideMargins {
    param(
        [string]$SourcePath,
        [string]$OutputPath
    )

    $bitmap = [System.Drawing.Bitmap]::FromFile($SourcePath)

    try {
        $xBounds = Get-GridAxisBounds -Bitmap $bitmap -Axis X
        $yBounds = Get-GridAxisBounds -Bitmap $bitmap -Axis Y
        if ($null -eq $xBounds -or $null -eq $yBounds) {
            Copy-Item -LiteralPath $SourcePath -Destination $OutputPath -Force
            return [pscustomobject]@{
                Name = [IO.Path]::GetFileName($SourcePath)
                GridX = 0
                GridY = 0
                GridWidth = 0
                GridHeight = 0
                LeftTrim = 0
                TopTrim = 0
                RightTrim = 0
                Status = 'Copied'
            }
        }

        $leftMargin = $xBounds.FirstLine
        $topMargin = $yBounds.FirstLine
        $rightMargin = ($bitmap.Width - 1) - $xBounds.LastLine
        $leftTrim = if ($leftMargin -gt 0) { $leftMargin } else { 0 }
        $topTrim = if ($topMargin -gt 0) { $topMargin } else { 0 }
        $rightTrim = if ($rightMargin -gt 0) { $rightMargin } else { 0 }

        if ($leftTrim -eq 0 -and $topTrim -eq 0 -and $rightTrim -eq 0) {
            Copy-Item -LiteralPath $SourcePath -Destination $OutputPath -Force
            return [pscustomobject]@{
                Name = [IO.Path]::GetFileName($SourcePath)
                GridX = $xBounds.GridSize
                GridY = $yBounds.GridSize
                GridWidth = Get-GridCount -Length $bitmap.Width -GridSize $xBounds.GridSize
                GridHeight = Get-GridCount -Length $bitmap.Height -GridSize $yBounds.GridSize
                LeftTrim = 0
                TopTrim = 0
                RightTrim = 0
                Status = 'Unchanged'
            }
        }

        $newWidth = $bitmap.Width - $leftTrim - $rightTrim
        $newHeight = $bitmap.Height - $topTrim
        $cropArea = [System.Drawing.Rectangle]::new($leftTrim, $topTrim, $newWidth, $newHeight)
        $croppedBitmap = $bitmap.Clone($cropArea, $bitmap.PixelFormat)

        try {
            Save-Image -Bitmap $croppedBitmap -Path $OutputPath -Format $bitmap.RawFormat
        }
        finally {
            $croppedBitmap.Dispose()
        }

        return [pscustomobject]@{
            Name = [IO.Path]::GetFileName($SourcePath)
            GridX = $xBounds.GridSize
            GridY = $yBounds.GridSize
            GridWidth = Get-GridCount -Length $newWidth -GridSize $xBounds.GridSize
            GridHeight = Get-GridCount -Length $newHeight -GridSize $yBounds.GridSize
            LeftTrim = $leftTrim
            TopTrim = $topTrim
            RightTrim = $rightTrim
            Status = 'Trimmed'
        }
    }
    finally {
        $bitmap.Dispose()
    }
}

if (-not (Test-Path -LiteralPath $SourceDirectory)) {
    throw "Source directory not found: $SourceDirectory"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Get-ChildItem -LiteralPath $OutputDirectory -File |
    Where-Object { $_.Extension -match '^(?i)\.(png|bmp|gif|jpe?g)$' } |
    Remove-Item -Force

$images = Get-ChildItem -LiteralPath $SourceDirectory -File |
    Where-Object { $_.Extension -match '^(?i)\.(png|bmp|gif|jpe?g)$' }

if ($images.Count -eq 0) {
    throw "No supported images found in: $SourceDirectory"
}

$results = foreach ($image in $images) {
    $tempOutputPath = Join-Path -Path $OutputDirectory -ChildPath $image.Name
    $result = Trim-SideMargins -SourcePath $image.FullName -OutputPath $tempOutputPath
    $finalName = Get-OutputFileName -SourcePath $image.FullName -GridWidth $result.GridWidth -GridHeight $result.GridHeight
    $finalOutputPath = Join-Path -Path $OutputDirectory -ChildPath $finalName

    if ($tempOutputPath -ne $finalOutputPath) {
        Move-Item -LiteralPath $tempOutputPath -Destination $finalOutputPath -Force
    }

    $result | Add-Member -NotePropertyName OutputName -NotePropertyValue $finalName
    $result
}

$results | Format-Table -AutoSize
