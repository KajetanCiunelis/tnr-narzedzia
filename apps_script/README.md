# Tablica wyników: wdrożenie Apps Script (ok. 10 min, raz na semestr)

Strona `speedtest/` leży na GitHub Pages, który serwuje tylko statyczne pliki. Wyniki zapisuje i oddaje mały skrypt Google Apps Script podpięty do Twojego Arkusza. Studenci nie logują się nigdzie.

## Kroki
1. Utwórz nowy Arkusz Google, np. „TNR – tablica wyników 2026/27”.
2. W Arkuszu: **Rozszerzenia → Apps Script**. Usuń zawartość `Kod.gs`, wklej całość `Code.gs` z tego folderu i zapisz.
3. **Wdróż → Nowe wdrożenie** (ikona koła zębatego → *Aplikacja internetowa*):
   - Wykonaj jako: **Ja**
   - Kto ma dostęp: **Każdy**
4. Kliknij *Wdróż*, zatwierdź uprawnienia (Google ostrzega, że aplikacja nie jest zweryfikowana: *Zaawansowane → Przejdź do…*). Skopiuj **URL aplikacji internetowej** (kończy się na `/exec`).
5. W `speedtest/index.html` wklej ten URL do stałej na górze skryptu:
   ```js
   const ENDPOINT = 'https://script.google.com/macros/s/…/exec';
   ```
   Wgraj plik na GitHub (repo `tnr-narzedzia`).
6. **PIN-y dla grup:** na górze `Code.gs` wpisz w `GRUPY` kody swoich 8 grup, np. `['PN1', 'PN2', 'WT1', …]`. Po dwukropku możesz dodać opis, np. `'CZ1:Kowalska'`. W `ADRES_STRONY` wpisz adres strony z GitHub Pages. Zapisz, wybierz funkcję **utworzPiny** i kliknij *Uruchom*. Skrypt wylosuje 6-cyfrowy PIN dla każdej grupy i utworzy arkusz `piny` z gotowymi linkami: dla studentów (do QR) i na rzutnik. PIN wyznacza grupę: wynik trafia do grupy z PIN-u, nawet gdy ktoś zmieni kod w linku. Bez PIN-ów tablica jest wyłączona: test działa, tylko nie da się nic wysłać.
7. Test: otwórz w przeglądarce `<URL>/exec?kod=TEST`. Powinno się pokazać `{"ok":true,"rows":[]}`. Arkusz `wyniki` tworzy się sam przy pierwszym wywołaniu.

## Na zajęciach
- QR dla studentów: link z kolumny „link dla studentów” w arkuszu `piny` (`…/speedtest/?kod=G1&pin=227758`). Kod grupy i PIN wpiszą się same.
- Inni prowadzący: sam link bez PIN-u wystarczy do przeprowadzenia testu. Jeśli mają mieć tablicę, daj im wiersz ich grupy z arkusza `piny`.
- Nowa grupa (np. inny prowadzący) bez ruszania istniejących PIN-ów: dopisz ją do `GRUPY` i uruchom **`dodajPiny`**. Nowy wiersz pojawi się w arkuszu `piny`. Tak dodano 5.10 grupy `MO` (Monika) i `AG` (Agnieszka).
- Nowe PIN-y (np. na następny semestr): uruchom ponownie `utworzPiny`. Stare przestaną działać od razu. **Uwaga:** dotyczy wszystkich grup naraz.
- Na rzutnik: `https://tnr.ciunelis.com/speedtest/?tablica&kod=WT`. **Tablica pyta o PIN grupy** (pole z ukrytymi cyframi), potem pamięta go na tym komputerze. PIN dopisany do linku (`&pin=…`) też zadziała i od razu zniknie z paska adresu. Najpierw **wykresy grupy**: prawo Hicka, odliczanie a losowy odstęp, koszt Stroopa, przeszukiwanie i błąd stały w ruchomym celu. Szare linie to pojedyncze osoby (bez pseudonimów), zielona linia to mediana. Wykres pojawia się od 3 osób. Pod nimi **ranking** (wielobój i każde zadanie) dla zabawy. Strona odświeża się co 15 s. Przełączanie zakładek co 12 s jest domyślnie włączone; kliknięcie zakładki je wyłącza.
- Podgląd wykresów bez studentów: uruchom **`wstawDaneTestowe`**. Skrypt doda osobną grupę `TEST` (własny PIN) z 20 fikcyjnymi osobami i wypisze w *Dzienniku wykonania* link na rzutnik. Po obejrzeniu uruchom **`usunDaneTestowe`**: znika grupa `TEST` razem z PIN-em, a pozostałe grupy zostają bez zmian. Obie funkcje działają bez nowego wdrożenia.
- **Kilka grup po kolei na jednym PIN-ie (np. współprowadząca):** pod tablicą jest przycisk *Nowa runda (wyczyść tablicę)*. Po wpisaniu **PIN-u prowadzącego** tablica i wykresy zaczynają od zera. Nic nie jest kasowane: stare wyniki zostają w arkuszu `wyniki` z numerem w kolumnie `runda`, a przycisk *Cofnij ostatnią rundę* przywraca poprzedni widok. PIN prowadzącego to osobny numer, którego studenci nie znają (PIN grupy z QR nie wystarczy). Tworzy go funkcja **`dodajPinyProwadzacych`**: każda grupa bez takiego PIN-u dostaje go w kolumnie F arkusza `piny`, a istniejące zostają. Współprowadzącej dajesz dwa numery: PIN grupy (do QR dla studentów) i PIN prowadzącego (do nowej rundy).
- Wielobój: w każdym zadaniu 1. miejsce daje 10 pkt, 2. miejsce 9 pkt i tak dalej, od 10. miejsca 1 pkt, a brak zadania 0 pkt. Wygrywa najwięcej punktów.
- Brak czasu: dopisz `&proby=3` do linku studentów (3 próby na zadanie, ok. 3 min).
- Niestosowny pseudonim: usuń wiersz w arkuszu `wyniki`. Tablica zaktualizuje się w ciągu kilkunastu sekund.

## Zmiany w skrypcie
Po edycji `Code.gs`: **Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa wersja → Wdróż**. URL zostaje ten sam. *Nowe wdrożenie* dałoby nowy URL.

## Ochrona
- Zapis i odczyt tablicy tylko z poprawnym PIN-em grupy, a grupę ustala PIN (bez PIN-u nikt nie zobaczy rankingu ani wykresów). Po 30 błędnych PIN-ach w ciągu 10 min zapis jest blokowany na 10 min.
- Jedna osoba (kod + pseudonim) może wysłać najwyżej 10 razy na 10 min, a wszyscy razem 300 razy na minutę.
- Skrypt przyjmuje tylko znane zadania i wyniki w sensownym zakresie. Z pseudonimu wycina znaczniki i znaki, od których arkusz zaczyna formułę.
- Strona wstawia pseudonimy jako zwykły tekst, więc nie da się nimi niczego „podłożyć” na tablicy.

## Co jest w arkuszu
`czas | kod | nick | sport | modul | wynik | opis | szczegoly | urzadzenie | opis_pinu | runda`. Kolumna `sport`: T = trenowany sport wymaga szybkiej reakcji, N = nie wymaga albo osoba nie trenuje sportu (od 9.10 pole obowiązkowe; puste tylko we wcześniejszych wpisach). Wszystkie grupy są w jednym arkuszu (kolumna `kod`), więc zestawienie całego rocznika zrobisz po fakcie filtrem albo tabelą przestawną. Każde wysłanie dopisuje osobny wiersz dla każdego zadania. Tablica pokazuje najlepszy wynik osoby z ostatnich 30 dni (`DAYS` w skrypcie). `szczegoly` to JSON z pojedynczymi próbami, np. do analizy prawa Hicka w raporcie. `wynik` to wynik rankingowy w ms, z karą 100 ms za każdy błąd; czysty wynik jest w `opis`.

## Gdyby kiedyś Supabase
W `index.html` cała komunikacja siedzi w obiekcie `api` (`send`, `board`). Wystarczy tabela `wyniki` z RLS (anon: tylko INSERT, SELECT z widoku z najlepszymi wynikami) i wymiana tych dwóch funkcji. Uwaga: darmowy projekt Supabase usypia się po tygodniu bez ruchu.
