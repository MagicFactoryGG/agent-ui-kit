# Why this exists

Read this before you build anything here. The recipes say how; this page says what it is for.

## The idea

More and more of what people do will be done with an agent: by voice, by a request in passing, by an assistant
that acts while the person is busy elsewhere. Organisations will send agents too. Some acts will still need the
person, directly. Interfaces today are made for one person tapping one screen.

This library makes every interface a good place for **everyone who shows up at the door**: a person, an agent, a
person working with an agent, an organisation. Each of them is a first-class guest. None is an afterthought,
and none is a threat by default. Think of a very good hotel or restaurant: whoever arrives is welcomed, served
well, and can ask for what is not on the menu.

## What that means in practice

- **One action, two doors.** Every control a person uses has a tool an agent uses, and both run the same
  action and reach the same state. Nothing is "the agent version".
- **The person always knows.** What an agent changed is marked on the control; it can be undone; what waits for
  the person is held in one place; a short notice says what happened. People stay in charge without having to
  watch.
- **Every act can leave the screen.** Each proposal and notice can be said in one sentence and answered in two
  words, so it works by voice, on a watch, in a car, or in a game, not only on a screen.
- **Mechanisms, not opinions.** The library does not decide who is trustworthy or how sure anyone must be. The
  app and its providers decide; the library carries their words, compares and records.
- **Native first, in Exact's way.** Controls are the platform's own where that matters to people. Where a brand
  needs to look like itself, drawn pieces take its theme, so it looks the same on the web, a Mac and a phone.
- **The brand's own look, not ours.** Any brand can start from its own products (distilled), from a known
  design system, or from a blend, and change everything in one place: every app follows.

## How to judge your work

Ask, for anything you build:
1. Would a person using it feel welcome and in control?
2. Can an agent do the same thing through a tool, and does the person see that it did?
3. Would it still make sense said aloud?
4. Does it look like it belongs to the brand that uses it, on every host?
5. Is it the simplest thing that does this well?

If the honest answer to any of these is no, it is not finished.

## What this is built on

- **Exact** (github.com/expo/exact): one app description that builds native apps for the web, macOS, iOS and
  more. It is new; read its `docs/start-here.md` first. Do not assume it works like React or SwiftUI.
- **UI SDK's idea**: components that are ready for agents. We take that idea further: from each component to
  each act, for every party.
