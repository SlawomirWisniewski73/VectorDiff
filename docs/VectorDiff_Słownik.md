# Słownik Języka VectorDiff

"Słownik Języka VectorDiff" to kluczowy element formalnej specyfikacji – precyzyjnie definiuje ontologię systemu.
Poniżej znajdują się definicje podstawowych struktur danych, które tworzą fundament języka VectorDiff.

## Struktura Hierarchiczna (Notacja UML/YAML)

Podstawowa struktura danych w VectorDiff jest hierarchiczna i składa się z trzech głównych komponentów: `VectorDiff`, `VectorObject` i `Timeline`.

```yaml
VectorDiff:
  properties:
    baseScene: VectorObject[]   # Tablica obiektów początkowych
    timeline: Timeline          # Słownik transformacji w czasie

VectorObject:
  properties:
    id: string                  # Unikalny identyfikator (UUIDv4)
    [cite_start]type: string                # Typ semantyczny (np. "particle", "neuron", "svg_path") [cite: 3]
    [cite_start]attributes: AttributeMap    # Mapa właściwości (kolor, pozycja, masa, etc.) [cite: 3]

AttributeMap:
  properties:
    position?: [float, float]   # Opcjonalne współrzędne (x,y)
    color?: string              # HEX/RGBA
    physical_properties?: {...}  # Niestandardowe pola dla domeny
     # ... dowolne rozszerzenia

Timeline:
  type: object
  patternProperties:
    "^t\\d+$": Transformation[]   # Klucze: timestamp (t0, t1, ...)

Transformation:
  [cite_start]discriminator: type           # Pole decydujące o typie transformacji [cite: 4]
  properties:
    targetId: string            # ID VectorObject docelowego
Definicje JSON Schema
Poniższe fragmenty JSON Schema formalnie definiują kluczowe obiekty.
Definicja VectorObject
JSON
"VectorObject": {
  "type": "object",
  "required": ["id", "type"],
  "properties": {
    "id": { 
      "type": "string", 
      "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$" 
    },
    "type": { "type": "string" },
    "attributes": { "type": "object" }
  }
}
Definicja Transformation
Struktura bazowa dla wszystkich transformacji, wykorzystująca oneOf do walidacji jednego z dozwolonych typów operacji.
JSON
"Transformation": {
  "type": "object",
  "required": ["type", "targetId"],
  "oneOf": [
    { "$ref": "#/definitions/Translate" },
    { "$ref": "#/definitions/Rotate" },
    { "$ref": "#/definitions/Scale" },
    { "$ref": "#/definitions/UpdateAttributes" },
    { "$ref": "#/definitions/ChangePath" },
    { "$ref": "#/definitions/CreateObject" },
    { "$ref": "#/definitions/DeleteObject" }
  ]
}
