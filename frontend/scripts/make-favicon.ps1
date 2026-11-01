# Small helper for scripts/make-icons.ps1: packs the 16, 32 and 48 px PNGs
# into one real .ico file (PNG-compressed entries, as every modern browser
# and Next's build accept).
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sizes = 16, 32, 48

$pngs = foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $u = $size / 64.0

  # rounded emerald tile
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml("#17795f")), ([System.Drawing.ColorTranslator]::FromHtml("#093528")), 45
  $r = 15 * $u
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
  $path.AddArc($size - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($size - 2 * $r, $size - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $path.AddArc(0, $size - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)

  # the L and the coin, in the same places as app/icon.svg
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#f7f1e1")), (7 * $u)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $letter = New-Object System.Drawing.Drawing2D.GraphicsPath
  $letter.AddLine(18 * $u, 16 * $u, 18 * $u, 45 * $u)
  $letter.AddArc(18 * $u, 42 * $u, 6 * $u, 6 * $u, 180, 90)
  $letter.AddLine(21 * $u, 48 * $u, 42 * $u, 48 * $u)
  $g.DrawPath($pen, $letter)
  $coin = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#dca847"))
  $g.FillEllipse($coin, 35 * $u, 14 * $u, 13 * $u, 13 * $u)

  $g.Dispose()
  $stream = New-Object System.IO.MemoryStream
  $bmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , $stream.ToArray()
}

$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([byte[]](0, 0, 1, 0, 3, 0))

$offset = 6 + 16 * 3
for ($i = 0; $i -lt 3; $i++) {
  $writer.Write([byte[]]($sizes[$i], $sizes[$i], 0, 0))
  $writer.Write([byte[]](1, 0, 32, 0))
  $writer.Write([byte[]]([BitConverter]::GetBytes([UInt32]$pngs[$i].Length)))
  $writer.Write([byte[]]([BitConverter]::GetBytes([UInt32]$offset)))
  $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $writer.Write([byte[]]$png) }

$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $root "app/favicon.ico"), $stream.ToArray())
$writer.Dispose()
Write-Output "wrote app/favicon.ico"
