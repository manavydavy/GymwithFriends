# Gym Colonisers v0.3 (online)

Browser multiplayer prototype. Mates race for the most gains before the gym closes.
One small Node.js server runs the game and serves the page, so the whole thing is one link.

## What's in the folder

| File | What it does |
|---|---|
| `server.js` | The game server. Runs rooms, the clock, machines, towels, shoves, strikes, scores and practice dummies. |
| `models.js` | Drawings of the characters and all 15 machines, including how each one animates during a rep. |
| `shared.js` | The gym layout and every tuning number (`CFG`). Used by both the server and the browser. |
| `public/index.html` | The game page each player opens. Draws the gym, handles controls, talks to the server. |
| `package.json` | Tells hosting services how to install and start the server. |

To change a rule or number, edit `CFG` at the top of `shared.js`, then redeploy.

## Put it online (about 15 minutes, one time)

You need a free GitHub account and a free account on a host that runs Node.js apps.
These steps use Render. Railway and Fly.io work similarly. Hosting plans change, so check
the current free-tier terms when you sign up.

### 1. Put the code on GitHub
1. Sign in at github.com and click **New** to make a repository. Name it `gym-colonisers`. Private is fine.
2. On the new repo page, click **uploading an existing file**.
3. Drag in everything inside this folder: `server.js`, `shared.js`, `package.json`, `README.md` and the `public` folder.
   (Don't upload a `node_modules` folder if you have one.)
4. Click **Commit changes**.

### 2. Deploy on Render
1. Sign in at render.com with your GitHub account.
2. Click **New**, then **Web Service**, and pick your `gym-colonisers` repo.
3. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. Click **Create Web Service** and wait for the log to say `Gym Colonisers running on port …`.
5. Render gives you a link like `https://gym-colonisers-xxxx.onrender.com`. That's the game.

Free servers go to sleep when nobody's playing. The first person to open the link after a
break may wait up to a minute while it wakes up. After that it's quick.

### 3. Updating later
Upload changed files to the GitHub repo (same **Add file → Upload files** button).
Render redeploys automatically. Anyone mid-game gets disconnected and can hit **Rejoin**.

## Playing

1. Open the link, type your name and leave the room code blank to create a room.
2. Tap **Share** or **Copy link** in the lobby and send it to your mates.
3. The host presses **Start round**. Everyone gets a 5 second countdown, then the round starts. Up to 6 players per room.
4. Playing alone? The host can **Add a practice dummy** (up to 3) to test against.

Phone: drag on the left side to move, buttons on the right.
PC: WASD or arrows, Space rep, E use or step off, Q throw towel, C wipe down, F shove, R "Yep, using it", 1–4 quick chat.

Your towel has two uses: throw it to claim a machine, or wipe down to clear your fatigue instantly.
Wiping puts the towel on a 20 second cooldown (`wipeCooldown` in `shared.js`), and if your towel
was on a claim, wiping takes it back off.

## Run it on your own computer (optional)

1. Install Node.js (version 18 or newer) from nodejs.org.
2. In a terminal inside this folder: `npm install`, then `npm start`.
3. Open `http://localhost:3000`.
4. Mates on the same Wi-Fi can join using your computer's local IP, for example `http://192.168.1.20:3000`.

For a quick test round, start it with a shorter clock: `ROUND_LENGTH=40 npm start` (Mac/Linux).
