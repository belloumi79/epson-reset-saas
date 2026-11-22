from dataclasses import dataclass, asdict
from typing import Optional, List
import platform
import sys
import os

@dataclass
class PrinterInfo:
    vendor_id: int
    product_id: int
    model: str
    serial: str
    supported: bool

@dataclass
class WasteCounter:
    name: str
    addresses: List[int]
    values: List[Optional[int]]
    reset_values: List[int]

class EpsonResetCore:
    def __init__(self):
        self.printer = None

    def discover(self) -> List[PrinterInfo]:
        if platform.system() == "Windows":
            return self._discover_windows()
        return self._discover_linux()

    def _discover_linux(self) -> List[PrinterInfo]:
        try:
            vendor_path = os.path.join(os.path.dirname(__file__), '..', 'vendor', 'epson-ink-pad-reset')
            if os.path.exists(vendor_path):
                sys.path.insert(0, vendor_path)
            from epson.usb_printer import list_epson_usb_printers
            raw = list_epson_usb_printers()
            return [PrinterInfo(
                vendor_id=0x04b8,
                product_id=int(p["product_id"], 16),
                model=p["model"],
                serial=p.get("serial", ""),
                supported=p["supported"]
            ) for p in raw]
        except Exception as e:
            print(f"Discover error: {e}")
            return []

    def _discover_windows(self) -> List[PrinterInfo]:
        try:
            from epson_usb import find_devices
            devices = find_devices(vid=0x04b8)
            return [PrinterInfo(
                vendor_id=d.vendor_id,
                product_id=d.product_id,
                model=d.description or f"Epson 0x{d.product_id:04X}",
                serial=d.serial or "",
                supported=True
            ) for d in devices]
        except Exception as e:
            print(f"Discover error: {e}")
            return []

    def connect(self, product_id: int) -> bool:
        if platform.system() == "Windows":
            from epson_usb import EpsonUsbPrinter
            self.printer = EpsonUsbPrinter(
                read_key=(7, 151),
                write_key=b"Nbsjcbzb",
                pid=product_id,
                backend="usbprint"
            )
        else:
            from epson.usb_printer import EpsonUSBPrinter
            self.printer = EpsonUSBPrinter(f"0x{product_id:04X}")
        ok, _ = self.printer.connect()
        return ok

    def read_counters(self) -> List[WasteCounter]:
        if not self.printer:
            return []
        raw = self.printer.read_waste_counters()
        return [WasteCounter(
            name=pad["desc"],
            addresses=pad["addr"],
            values=[v for _, v in pad["values"]],
            reset_values=pad["reset"]
        ) for pad in raw]

    def reset_counters(self) -> bool:
        if not self.printer:
            return False
        ok, *_ = self.printer.reset_waste_counters()
        return ok

    def disconnect(self):
        if self.printer:
            self.printer.disconnect()
            self.printer = None