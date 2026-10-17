# Live sync with Firebase: one-time maintainer setup

This is done **once by the person who publishes GeoOps** (about 10 minutes). Schools that use your copy
need no setup: the facilitator opens Mission Control, picks a password, presses **Create a new event**,
and shares the event code that appears. Teams type that code on the start screen.

Cost: the free Spark plan is enough and never charges. If a limit is ever reached, the service pauses
instead of billing. Do not upgrade to the Blaze plan.

If you skip this guide, GeoOps still works: teams copy a result code and the facilitator imports it.

## 1. Create the project
1. Go to https://console.firebase.google.com and create a project (Google Analytics off).
2. Project settings (gear icon) → **General** → "Your apps" → web icon `</>` → register an app.
   Copy the `apiKey` value.

## 2. Turn on sign-in
Build → **Authentication** → Get started → **Email/Password** → Enable.
Do not add users. The app creates one account per event by itself.

## 3. Create the database
Build → **Realtime Database** → Create database → choose a location → **locked mode**.
Copy the database URL shown at the top (for example `https://my-project-default-rtdb.firebaseio.com`).

## 4. Paste the security rules
Realtime Database → **Rules** → replace everything with this, then **Publish**:

```json
{
  "rules": {
    "events": {
      "$event": {
        ".read": "auth != null && data.child('owner').val() === auth.uid",
        ".write": "auth != null && data.child('owner').val() === auth.uid",
        "owner": {
          ".write": "auth != null && !data.exists() && newData.val() === auth.uid"
        },
        "meta": { ".read": true },
        "published": { ".read": true },
        "submissions": {
          ".read": "auth != null && root.child('events').child($event).child('judges').child(auth.uid).val() === true",
          "$id": {
            ".write": "!data.exists() && newData.exists() && root.child('events').child($event).child('meta').exists()",
            ".validate": "newData.hasChildren(['teamName', 'mission', 'answers']) && newData.child('teamName').isString() && newData.child('teamName').val().length < 80"
          }
        },
        "scores": {
          ".read": "auth != null && root.child('events').child($event).child('judges').child(auth.uid).val() === true",
          "$sid": {
            "$judge": {
              ".write": "auth != null && root.child('events').child($event).child('judges').child(auth.uid).val() === true",
              ".validate": "newData.hasChildren(['judge', 'criteria', 'total'])"
            }
          }
        },
        "checkins": {
          "$key": {
            ".write": "!data.exists() && newData.exists() && root.child('events').child($event).child('meta').exists()"
          }
        },
        "approved": { ".read": true }
      }
    }
  }
}
```

What the rules do:
- The first account to claim an event code becomes its owner. Only the owner can read all data, approve,
  reject or verify teams. The owner's password is the facilitator password.
- Teams can add one submission or check-in to an existing event, and cannot read or change anything.
- Anyone with the event code can read the approved scores (no answers) for the Command Display, and the
  published rubric breakdowns (averaged per team) that appear on each team's finish page.
- Judges: the owner sets a shared judge password in Mission Control. Judges sign in with their own name,
  can read submissions and write only their own scores. Scores stay private until the owner presses **Publish results**.
- Event codes are random (for example `KRT-4821`), so nobody can claim an event meant for someone else.

## 5. Paste the config into the page
In `index.html`, find `FIREBASE_CONFIG` and fill in both values:

```js
const FIREBASE_CONFIG = {
  apiKey: "your apiKey",
  databaseURL: "https://my-project-default-rtdb.firebaseio.com"
};
```

The apiKey is not a secret; the rules above are what protect the data. Publish the file (for example on
GitHub Pages) and share the link.

## Running an event
1. Facilitator: Mission Control → choose a password (6+ characters) → **Create a new event**. Share the event code shown.
2. Teams: type the event code and pick their team.
3. Facilitator: Mission Control → set a judge password and the minimum judges per submission. Judges sign in with
   the judge password and their name, then score each submission by rubric. The owner scores too.
4. When everyone is done, the owner presses **Publish results**. Edit scores and publish again to correct anything.
   Open the Command Display in the same browser.
4. Next time, enter the event code and password to reopen the same event on any device.

## Limits worth knowing
- If the facilitator forgets the password, that event cannot be reopened. Create a new event.
- Anyone can create events, which uses a little of the free storage. Delete old events from the database
  console occasionally.
- If a team's connection drops, the submission retries automatically and the team still has a result code.
