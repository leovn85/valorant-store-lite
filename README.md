# Valorant Store Lite 🛒

A lightweight, fast, and simple web application to check your Valorant Daily Store, Featured Bundles, Night Market, and Accessory Store without opening the game.

## Features
- 🚀 **O(1) Asset Caching:** Lightning-fast store lookups.
- 🔄 **Multi-Account Support:** Save multiple accounts via Cookies and switch between them instantly.
- 🎥 **Media Preview:** Preview weapon skin videos in the browser.
- 🔒 **Local Storage:** Your cookies are stored locally in an `accounts.json` file. No database, no data collection.

## Quick Start (For Users)
Download the `.exe` file from the **[Releases](../../releases)** tab. Double-click it, and it will automatically start the server and open the store in your default web browser!

## How to Get Your Riot Cookie 🍪
To use this app, you need to provide a Riot authentication cookie. We have included a custom Chrome Extension to make this easy:

1. Open your Chromium-based browser (Chrome, Edge, Brave).
2. Go to `chrome://extensions/` (or `edge://extensions/`).
3. Turn on **Developer mode** (usually a toggle in the top right corner).
4. Click **Load unpacked** and select the folder containing the `Riot Cookie Grabber` extension files (`manifest.json`, `popup.html`, etc.).
5. Go to [https://playvalorant.com/](https://playvalorant.com/) and log in to your Valorant account.
6. Click the extension icon in your browser toolbar and click **Get Cookie String**.
7. Paste the copied cookie into the web app!

## Development Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Run the server: `npm start`
4. Open `http://localhost:3000` in your browser.

## Disclaimer
This project is not affiliated with Riot Games. It uses Riot's official APIs to fetch user data. Use at your own risk.