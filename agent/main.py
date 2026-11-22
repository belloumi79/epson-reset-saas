#!/usr/bin/env python3
"""
Epson Reset Agent - Connects local USB printer to cloud service
Usage: python main.py [--backend wss://api.domain.com]
"""
import asyncio
import websockets
import json
import uuid
import platform
import os
import sys
import signal
import argparse
from pathlib import Path
from dataclasses import asdict

sys.path.insert(0, str(Path(__file__).parent))
from core.printer import EpsonResetCore


class EpsonAgent:
    def __init__(self, backend_ws: str = "wss://api.epson-reset.belloumi.com"):
        self.backend_ws = backend_ws.rstrip('/')
        self.agent_id = self._get_or_create_agent_id()
        self.core = EpsonResetCore()
        self.ws = None
        self.pending = {}
        self.running = True

    def _get_or_create_agent_id(self) -> str:
        id_file = Path.home() / ".epson_reset_agent_id"
        if id_file.exists():
            return id_file.read_text().strip()
        agent_id = str(uuid.uuid4())
        id_file.write_text(agent_id)
        return agent_id

    async def connect(self):
        uri = f"{self.backend_ws}/ws/agent/{self.agent_id}"
        print(f"🔌 Connexion à {uri}...")
        self.ws = await websockets.connect(uri, ping_interval=20, ping_timeout=10)
        print(f"✅ Agent connecté: {self.agent_id}")
        await self._discover_and_report()

    async def _discover_and_report(self):
        printers = self.core.discover()
        await self.ws.send(json.dumps({
            "type": "printers_discovered",
            "payload": {"printers": [asdict(p) for p in printers]}
        }))
        print(f"📋 {len(printers)} imprimante(s) envoyée(s) au backend")

    async def handle_messages(self):
        try:
            async for message in self.ws:
                await self._process_message(json.loads(message))
        except websockets.ConnectionClosed:
            print("❌ Connexion fermée par le serveur")
        except Exception as e:
            print(f"❌ Erreur WebSocket: {e}")

    async def _process_message(self, msg: dict):
        msg_type = msg.get("type")
        request_id = msg.get("request_id")
        payload = msg.get("payload", {})

        try:
            if msg_type == "read_counters":
                result = await self._handle_read_counters(payload)
            elif msg_type == "reset":
                result = await self._handle_reset(payload)
            elif msg_type == "connect":
                result = {"success": self.core.connect(payload["product_id"])}
            elif msg_type == "disconnect":
                self.core.disconnect()
                result = {"success": True}
            else:
                result = {"error": f"Type inconnu: {msg_type}"}
        except Exception as e:
            result = {"error": str(e)}

        if request_id:
            await self.ws.send(json.dumps({
                "type": "response",
                "request_id": request_id,
                "payload": result
            }))

    async def _handle_read_counters(self, payload: dict) -> dict:
        pid = int(payload["product_id"], 16)
        if not self.core.connect(pid):
            return {"error": "Connexion imprimante échouée"}
        counters = self.core.read_counters()
        return {"counters": [asdict(c) for c in counters]}

    async def _handle_reset(self, payload: dict) -> dict:
        pid = int(payload["product_id"], 16)
        if not self.core.connect(pid):
            return {"success": False, "error": "Connexion imprimante échouée"}
        ok = self.core.reset_counters()
        return {"success": ok}

    async def send_heartbeat(self):
        while self.running:
            await asyncio.sleep(30)
            if self.ws and self.ws.open:
                await self.ws.send(json.dumps({"type": "heartbeat"}))

    async def run(self):
        await self.connect()
        await asyncio.gather(
            self.handle_messages(),
            self.send_heartbeat()
        )


def main():
    parser = argparse.ArgumentParser(description="Epson Reset Agent")
    parser.add_argument("--backend", default="wss://api.epson-reset.belloumi.com",
                        help="Backend WebSocket URL")
    args = parser.parse_args()

    agent = EpsonAgent(args.backend)

    def shutdown():
        agent.running = False
        if agent.core.printer:
            agent.core.disconnect()
        print("\n🛑 Arrêt de l'agent...")

    signal.signal(signal.SIGINT, lambda *_: shutdown())
    signal.signal(signal.SIGTERM, lambda *_: shutdown())

    print("🚀 Epson Reset Agent")
    print(f"   Agent ID: {agent.agent_id}")
    print(f"   Backend: {args.backend}")
    print(f"   OS: {platform.system()}")

    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        pass
    finally:
        shutdown()


if __name__ == "__main__":
    main()