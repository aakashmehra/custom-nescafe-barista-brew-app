# Custom Nescafe Barista Machine App

**A simple, fast, custom Bluetooth app for Nescafé coffee machines.** Unofficial.

A custom Nescafé Barista app with custom recipes, custom drinks and favorites. An alternative to the official app.

[日本語はこちら → README.ja.md](README.ja.md)

---

## Why I made this

I use a Nescafé Gold Blend Barista every day, and the official app kept getting in the way. It had a lot of bugs, and it logged me out every so often, so I had to sign in and reconnect again and again just to make a cup of coffee.

So I built my own. Custom Nescafe Barista Machine App connects to the machine directly over Bluetooth. No account, no login, no cloud. Open the app, tap Connect, make coffee.

> **Nescafé team, if you're reading this repo:** hire me for your design. I'll build you a really good app. 🙂
> **hello@aakashmehra.com**

## Features

- **One-tap connect.** Finds nearby machines, pairs once, and reconnects automatically after that.
- **No account, no login.** Everything stays on your phone.
- **Custom recipes.** Full drink menu with custom strength, water and milk-foam controls.
- **Custom favorites.** Save your own custom drink with your settings and a custom name, then brew it in one tap.
- **How-to for every drink**: how much water, milk and which capsule to use.
- **Machine and cup animations.** Clean black and white UI, Inter font, Liquid Glass on iOS.
- **12 app icons** to choose from in Settings.
- **Light and dark mode.**

## Supported machines

| Machine | Status |
|---|---|
| Nescafé Gold Blend **Barista W** | Built and tested with this one |
| Nescafé Gold Blend **Barista Slim** | Tested, works |
| Barista i, Barista 50, Barista Simple, Barista Duo | Supported, not tested yet |
| Dolce Gusto **Esperta**, **Genio S** | Supported, not tested yet |

If you try it with another model, please open an issue and tell me how it went.

## ⚠️ "Water only" is not recommended

Most Barista machines can't dispense plain hot water, because every drink program adds coffee. On some machines (like the Barista W) Custom Nescafe Barista Machine App uses the **rinse cycle** to get hot water out, with an optional one-time setup to estimate the amount. It works, but it's a workaround: the amount is approximate and the water temperature can't be set. **I don't recommend relying on it.**

## Install

### TestFlight
**Coming soon.**

### Sideload the IPA
Download `CustomNescafeBaristaMachine.ipa` from [Releases](../../releases) and install it with [AltStore](https://altstore.io) or [Sideloadly](https://sideloadly.io) using your own Apple ID. The IPA is unsigned, so those tools sign it for your device. With a free Apple ID you'll need to refresh it every 7 days.

### Build from source
Requires a Mac with Xcode and Node.js.

```bash
git clone https://github.com/aakashmehra/custom-nescafe-barista-machine-app.git
cd custom-nescafe-barista-machine-app
npm install
npx expo run:ios --device
```

> Running in **Expo Go** (`npx expo start`) works too, but only in **Demo mode** with a simulated machine, because Expo Go has no Bluetooth access.

## How to use

1. **Turn on your machine** and keep your phone close.
2. Open the app and tap **Connect**. Pick your machine from the list.
3. **First time only, pair:**
   - **Barista:** switch the machine **off** with its power button (keep it plugged in). When a button lights up **green**, press it within about 5 seconds.
   - **Dolce Gusto:** switch the machine off, then tap the brew button while the lights blink.
4. Choose a drink, adjust **strength / water / milk**, and tap **Brew**.
5. Tap **★** to save it as a favorite. Tap **ⓘ** to see how to make it.
6. **Settings** (gear icon): change the app icon, disconnect or forget the machine.

After pairing, Custom Nescafe Barista Machine App reconnects on its own the next time you open it.

## Tech

Expo SDK 57 · React Native · TypeScript · Expo Router · Reanimated · react-native-svg · react-native-ble-plx

```bash
npm run typecheck        # TypeScript
npm run test:protocol    # protocol unit tests
```

## Disclaimer

Custom Nescafe Barista Machine App is an independent, unofficial project. It is **not affiliated with, endorsed by, or sponsored by Nestlé**. Nescafé, Dolce Gusto, Gold Blend Barista, Starbucks and all related names are trademarks of their respective owners and are used here only to describe compatibility.

This app controls a machine that dispenses hot liquid. Use it at your own risk, always place a cup that is large enough, and keep an eye on the machine while it's running.

## License

[MIT](LICENSE) © 2026 Aakash Mehra · hello@aakashmehra.com
