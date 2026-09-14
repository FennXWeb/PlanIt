# Activate Google Drive sync for PlanIt

The sync integration is implemented, but Google sign-in stays unavailable until the site owner registers a public OAuth web client ID. Ordinary PlanIt users will only need to connect their Google account after this setup.

## One-time setup

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create or select a project for **PlanIt**.
2. In **APIs & Services → Library**, enable **Google Drive API** for that project.
3. Open **Google Auth Platform** and configure the app branding and audience. Use **PlanIt** as the app name and your own support/developer contact email. For personal testing, choose an external testing audience and add your Google account as a test user. Both devices must connect that same account. Wider use requires adjusting the audience and completing any verification Google requests.
4. Use these app URLs where requested:
   - Home page: `https://fennxweb.github.io/PlanIt/`
   - Privacy information: `https://fennxweb.github.io/PlanIt/privacy.html`
5. Under **Data Access**, add only `https://www.googleapis.com/auth/drive.appdata`. This grants access to PlanIt’s private application-data folder, rather than the user’s other Drive files. [Google’s scope documentation](https://developers.google.com/workspace/drive/api/guides/appdata).
6. Under **Clients**, create an OAuth client with type **Web application**. Add `https://fennxweb.github.io` to **Authorized JavaScript origins**. Use the origin only, without `/PlanIt/`. The app uses Google’s popup token flow, so it does not need a server redirect endpoint. Copy the client ID ending in `.apps.googleusercontent.com`. **Do not copy or send the client secret.** [Google’s client setup guide](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid).
7. Either send that public client ID back to the coding assistant for configuration, or open [PlanIt’s GitHub Actions variables](https://github.com/FennXWeb/PlanIt/settings/variables/actions) and add a repository variable named **GOOGLE_CLIENT_ID** with the ID as its value.
8. In [PlanIt’s deployment workflow](https://github.com/FennXWeb/PlanIt/actions/workflows/pages.yml), choose **Run workflow** on **main**. The build validates and includes the public ID. No client secret is used or stored.
9. Once publishing finishes, close all PlanIt tabs and reopen the app to activate its updated offline cache. On desktop, open **Settings → Cloud sync → Manage connection**, connect Google Drive, and wait for **Up to date**. On mobile, open PlanIt and use **Connect Google Drive** in the setup wizard with the same account. The workspace should load without repeating setup.

## Verify with your account

Live Google authorization cannot be verified before a real client ID exists. After activation, check one desktop and one mobile browser: save an aisle description on desktop, wait for **Up to date**, then open/connect mobile and confirm it appears. Make a mobile change and repeat in the other direction. Google requires a user action to renew expired authorization; PlanIt shows **Reconnect** and keeps edits local until you do. Simply being signed into Google in another tab does not grant the app access. [Google’s token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model).

Use the normal browser if an embedded browser blocks Google sign-in popups. For local development, authorize `http://localhost` and `http://localhost:4173`, then set the public client ID in `src/cloud-config.js`. The production build can override that file through the repository variable.

## Storage and conflicts

- Sync runs five seconds after saved edits, every 30 seconds while visible, and when returning to the app or reconnecting to the network. It does not run while the app is closed. Local saves work offline.
- Cloud saves are immutable versions. The app detects concurrent desktop/mobile edits and asks which complete workspace to continue with. It does not automatically merge task records. Previous cloud versions remain in Drive; there is no automatic history deletion.
- Google Drive storage usage grows with saved versions. Cloud snapshots are limited to 4 MB each and the client checks at most 10,000 version records. Quota, oversized-workspace, and permission failures appear as sync errors while local work remains available.
- Before replacing local work during conflict resolution, PlanIt saves a pre-sync recovery copy locally. Export it under **Settings → Local data & backups → Export pre-sync recovery**. You can also download each current conflicting cloud version.
- To clear cloud history, first export the workspace you want to keep and disconnect **every device**. In Google Drive settings, manage connected apps and delete PlanIt’s hidden app data. Reconnect the device with the exported/current workspace first, then the other devices. Clearing cloud data removes its recovery versions.
- **Disconnect this device** stops PlanIt syncing on that browser and clears its link metadata; it does not delete either copy. To revoke Google permission completely, remove PlanIt in your Google Account’s third-party connections. Restoring an imported backup disconnects sync before replacing local data.

## iCloud

The setup wizard can import a PlanIt JSON backup selected from iCloud Drive through the device’s file picker. This is manual transfer. Automatic iCloud sync is not implemented: Apple’s web integration uses a CloudKit container and API token registered by an Apple developer, not generic browser access to a user’s iCloud Drive folder. [Apple’s CloudKit JS documentation](https://developer.apple.com/documentation/cloudkitjs), [Apple’s private database sample requirements](https://github.com/apple/sample-cloudkit-privatedb).
