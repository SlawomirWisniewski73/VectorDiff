# VectorDiff
--
## A. VectorDiff – Biblioteka i format

## B. VectorDiff – Język specyfikacji formalnej
--

## English version --> readme_ENG.md 
## Strona projektu --> https://vectordiff.org/ 
--


## Część A: VectorDiff – Biblioteka i format

VectorDiff to innowacyjny format animacji wektorowych, który optymalizuje zasoby poprzez śledzenie i zapisywanie tylko zmian między klatkami. Szczególnie przydatny dla animacji generowanych przez AI oraz zastosowań medycznych.

Ale

Również uniwersalny format dla danych dynamicznych z możliwością wykorzystania jako meta-język dla AI

### How to cite:
Wiśniewski, Sławomir (2025). <b>VectorDiff: A manifesto for a differential, semantically rich vector animation format for scientific and AI-driven visualization</b>. Figshare preprint. https://doi.org/10.6084/m9.figshare.29410109

Wiśniewski, Sławomir (2025). <b>VectorDiff as a Meta-language of Artificial Intelligence Consciousness: Case Studies of Cognitive Framework Adoption in AI Systems</b>. Figshare preprint. https://doi.org/10.6084/m9.figshare.29570678.v1

### Support the project
https://pay.vivawallet.com/scibiz

### Główne cechy

- **Oszczędność zasobów** - zapisuje tylko zmieniające się elementy między klatkami.
- **Format wektorowy** - nieskończona skalowalność i precyzja.
- **Integracja z AI** - zoptymalizowany dla animacji generowanych przez AI.
- **Zastosowania medyczne** - modelowanie molekularne, diagnostyka radiologiczna, chirurgia robotyczna.

### Struktura projektu
vectordiff/
├── packages/ # Moduły podstawowe
├── applications/ # Aplikacje końcowe
└── tools/ # Narzędzia deweloperskie

### Współpraca
Zachęcamy do współpracy! Zobacz `CONTRIBUTING.md` dla zasad i wskazówek.

### Licencja
- Ten projekt jest udostępniany na licencji GNU AFFERO GENERAL PUBLIC LICENSE od 2 lipca 06.40PM
- Projekt pobrany do 2 lipca 06.40PM jest udostępniany na licencji MIT - szczegóły w pliku `LICENSE`.
- W dniu 14/7/25 wprowadzono dual-licensing
- DUAL LICENSING VECTORDIFF
Elastyczność dla Każdego Projektu

**VectorDiff jest dostępny pod podwójnym systemem licencjonowania, który pozwala na wybór najlepszego rozwiązania dla Twojego projektu.**


#### OPCJA 1: LICENCJA AGPL-3.0 (BEZPŁATNA)
- ✅ Pełny dostęp do kodu źródłowego
- ✅ Możliwość modyfikacji i dystrybucji
- ✅ Idealne dla projektów open source
- ❌ Wymóg udostępnienia modyfikacji
- ❌ Wymóg zachowania licencji AGPL-3.0

#### OPCJA 2: LICENCJA KOMERCYJNA
- ✅ Brak obowiązku udostępniania kodu
- ✅ Możliwość integracji z proprietary software
- ✅ Dedykowane wsparcie techniczne
- ✅ Gwarancje SLA
- ✅ Prawo do modyfikacji bez ujawniania

**JAK WYBRAĆ?**
- Twój kod będzie open source → AGPL-3.0
- Budujesz komercyjny produkt → Licencja komercyjna
- Potrzebujesz wsparcia technicznego → Licencja komercyjna
- Masz wątpliwości → Skontaktuj się z nami

KONTAKT: sa.wisniewski@sci4biz.edu.pl


---

## Część B: VectorDiff – Język specyfikacji formalnej

VectorDiff to nie tylko format, ale również kompletny język formalny służący do opisu transformacji scen wektorowych. Posiada precyzyjnie zdefiniowaną ontologię (Słownik), gramatykę i semantykę, co umożliwia jednoznaczną interpretację i walidację operacji.

### Kluczowe Koncepty

- **Słownik (Ontologia)**: Definiuje podstawowe byty, takie jak `VectorObject`, `Timeline` i `Transformation`[cite: 1, 2]. [cite_start]Każdy obiekt posiada unikalne `id` oraz semantyczny `type` (np. "neuron", "svg_path").
- **Gramatyka Transformacji (BNF)**: Formalna gramatyka w notacji BNF definiuje składnię wszystkich dostępnych transformacji, takich jak `translate`, `createObject` czy `updateAttributes`.
- **Semantyka Operacji**: Każda transformacja ma jasno określoną regułę wykonania, która opisuje jej wpływ na stan sceny (np. `object.position += delta`).

### Zasady Projektowe

Język VectorDiff opiera się na trzech fundamentalnych zasadach:

1.  **Zasada Delt**: Preferowanie operacji na różnicach (`delta`) zamiast stanów absolutnych w celu minimalizacji danych.
2.  **Niezależność Czasu**: Elastyczne stosowanie znaczników czasu (`timestamp`) jako klatek, czasu fizycznego (ISO 8601) lub zdarzeń logicznych.
3.  **Semantyczna Neutralność Typów**: Typ obiektu (`VectorObject.type`) nie wpływa na logikę transformacji, co daje swobodę interpretacji w warstwie aplikacji.

### Pełna Dokumentacja Języka

Pełna specyfikacja języka, w tym formalny słownik i gramatyka, znajduje się w katalogu `docs/`:

-   **`VectorDiff_Słownik.md`**: Definicje kluczowych obiektów i ich struktury.
-   **`VectorDiff_Specyfikacja_Języka.md`**: Kompletna, formalna specyfikacja języka z przykładami.

### Instalacja podstawowej biblioteki

```bash
cd packages/core
npm install
npm run build

---
