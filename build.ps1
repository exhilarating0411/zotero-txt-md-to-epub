$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outFile = Join-Path (Split-Path -Parent $projectDir) "txt-md-to-epub-for-zotero.xpi"
$versionedOutFile = Join-Path (Split-Path -Parent $projectDir) "txt-md-to-epub-for-zotero-0.3.5.xpi"
$tmpZip = [System.IO.Path]::ChangeExtension($outFile, ".zip")

if (Test-Path $outFile) {
    Remove-Item -LiteralPath $outFile -Force
}
if (Test-Path $versionedOutFile) {
    Remove-Item -LiteralPath $versionedOutFile -Force
}
if (Test-Path $tmpZip) {
    Remove-Item -LiteralPath $tmpZip -Force
}

$files = @(
    "manifest.json",
    "bootstrap.js",
    "README.md",
    "locale/en-US/txt-md-to-epub.ftl",
    "locale/zh-CN/txt-md-to-epub.ftl"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($tmpZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $path = Join-Path $projectDir $file
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $path,
            $file.Replace("\", "/"),
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

Rename-Item -LiteralPath $tmpZip -NewName (Split-Path -Leaf $outFile)
Copy-Item -LiteralPath $outFile -Destination $versionedOutFile
Write-Host "Built $outFile"
Write-Host "Built $versionedOutFile"
