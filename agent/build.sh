#!/bin/bash
set -e

# Build script for Epson Reset Agent
# Usage: ./build.sh [linux|windows|macos|all]

PLATFORM=${1:-all}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

echo "🔨 Building Epson Reset Agent for: $PLATFORM"

# Clean previous builds
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
pip install -q pyinstaller
pip install -q -r "$SCRIPT_DIR/requirements.txt"

# Clone epson-ink-pad-reset for Linux USB support
VENDOR_DIR="$SCRIPT_DIR/vendor"
if [ ! -d "$VENDOR_DIR/epson-ink-pad-reset" ]; then
    echo "📥 Cloning epson-ink-pad-reset..."
    git clone https://github.com/eAvio/epson-ink-pad-reset.git "$VENDOR_DIR/epson-ink-pad-reset"
fi

# Common PyInstaller options
COMMON_OPTS=(
    --onefile
    --name "epson-reset-agent"
    --add-data "$SCRIPT_DIR/core:core"
    --add-data "$VENDOR_DIR/epson-ink-pad-reset:vendor/epson-ink-pad-reset"
    --hidden-import epson_usb
    --hidden-import usb.backend.libusb1
    --hidden-import websockets
    "$SCRIPT_DIR/main.py"
)

build_linux() {
    echo "🐧 Building for Linux..."
    pyinstaller "${COMMON_OPTS[@]}" --name "epson-reset-agent-linux" --distpath "$DIST_DIR"
    echo "✅ Linux build complete: $DIST_DIR/epson-reset-agent-linux"
}

build_windows() {
    echo "🪟 Building for Windows..."
    pyinstaller "${COMMON_OPTS[@]}" --name "epson-reset-agent-windows.exe" --distpath "$DIST_DIR"
    echo "✅ Windows build complete: $DIST_DIR/epson-reset-agent-windows.exe"
}

build_macos() {
    echo "🍎 Building for macOS..."
    pyinstaller "${COMMON_OPTS[@]}" --name "epson-reset-agent-macos" --distpath "$DIST_DIR"
    echo "✅ macOS build complete: $DIST_DIR/epson-reset-agent-macos"
}

case $PLATFORM in
    linux)
        build_linux
        ;;
    windows)
        build_windows
        ;;
    macos)
        build_macos
        ;;
    all)
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            build_linux
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            build_macos
        elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
            build_windows
        else
            echo "❌ Unknown OS"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 [linux|windows|macos|all]"
        exit 1
        ;;
esac

echo "🎉 Build complete! Binaries in $DIST_DIR"
ls -la "$DIST_DIR"