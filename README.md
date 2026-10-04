# Narzędzia TNR (GitHub Pages)

Statyczne strony do ćwiczeń z Teorii nauczania ruchu (AWF Warszawa).

- `index.html` – test czasu reakcji (prosty, wybór 2, wybór 4). Pomiar w całości w przeglądarce, bez wysyłania danych.
- `protokol/index.html` – pełny protokół na zajęcia 3: 9 zadań po 3–5 prób (~4 min). RT prosty / wybór 2 / wybór 4, sygnał po odliczaniu, trafienie w rytm, ruchomy cel, go/no-go, przeszukiwanie wzrokowe, Stroop; szata AWF (zieleń, Lato). Każde zadanie można powtórzyć osobno. Opcjonalna tablica wyników przez Google Apps Script (`apps_script/`, instrukcja w `apps_script/README.md`).
  - studenci: `…/protokol/?kod=WT` (kod grupy wpisze się sam; `&proby=3` = wersja skrócona)
  - rzutnik: `…/protokol/?tablica&kod=WT` (wykresy grupy i ranking)
  - PIN do zapisu na tablicę: `&pin=…` w linku dla studentów (patrz `apps_script/README.md`)

## Publikacja
Adres: **https://tnr.ciunelis.com/** (protokół: `https://tnr.ciunelis.com/protokol/`). Repo `KajetanCiunelis/tnr-narzedzia`, GitHub Pages z gałęzi `main`, folder `/ (root)`; plik `CNAME` w tym folderze ustawia domenę.

1. Repo na GitHubie (publiczne – Pages za darmo tylko dla publicznych), wgraj zawartość tego folderu (`POMYSLY_miniaplikacje.md` jest w `.gitignore`).
2. Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`; Custom domain: `tnr.ciunelis.com`.
3. DNS w Cloudflare (domena `ciunelis.com`): rekord **CNAME**, nazwa `tnr`, cel `kajetanciunelis.github.io`, **Proxy status: DNS only** (szara chmurka – inaczej GitHub nie wystawi certyfikatu).
4. Po kilku–kilkunastu minutach: Settings → Pages → zaznacz *Enforce HTTPS*. Ten adres wklej na slajd i zrób z niego kod QR.
5. Aktualizacja strony: zmiana plików → `git commit` → `git push`; Pages przebudowuje się w ok. 1 min.

Kolejne narzędzia dokładaj jako podfoldery (`stroop/index.html`, `dual-task/index.html`) i linkuj z tej strony.
