# Pełna Specyfikacja Języka VectorDiff

Niniejszy dokument zawiera pełną, formalną specyfikację języka VectorDiff, obejmującą jego strukturę, gramatykę, semantykę i zasady projektowe.

## I. INTEGRACJA SŁOWNIKA ZE SPECYFIKACJĄ

### Struktura Hierarchiczna VectorDiff (Diagram UML w notacji YAML)
```yaml
VectorDiff:
  properties:
    baseScene: VectorObject[]   # Tablica obiektów początkowych
    timeline: Timeline          # Słownik transformacji w czasie
VectorObject:
  properties:
    id: string                  # Unikalny identyfikator (UUIDv4)
    type: string                # Typ semantyczny (np. "particle", "neuron", "svg_path")
    attributes: AttributeMap    # Mapa właściwości (kolor, pozycja, masa, etc.) 
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
  discriminator: type   # Pole decydujące o typie transformacji
  properties:
    targetId: string    # ID VectorObject docelowego



## II. FORMALNA SPECYFIKACJA TRANSFORMACJI

Gramatyka Transformacji (BNF rozszerzone)
BNF
<Transformation> ::= 
    <Translate> 
  | <Rotate> 
  | <Scale> 
  | <UpdateAttributes> 
  | <ChangePath> 
  | <CreateObject> 
  | <DeleteObject>

<Translate> ::= 
  '{' 
    '"type": "translate",' 
    '"targetId": <String>,'
    '"delta": [' <Number> ',' <Number> ']' 
  '}'

<UpdateAttributes> ::= 
  '{' 
    '"type": "updateAttributes",' 
    '"targetId": <String>,'
    '"changes": {' 
      (<AttributeKey> ':' <JSONValue>)+ 
    '}' 
  '}'

<CreateObject> ::= 
  '{' 
    '"type": "createObject",' 
    '"object": <VectorObject> '  # Obiekt z pełną definicją
  '}'
Semantyka Operacji (Reguły wykonania)
Transformacja	Reguła Semantyczna	Przykład JSON
translate	object.position += delta	{"type":"translate","delta":[5,0]}
updateAttributes	Nadpisanie atrybutów: object.attr = changes	{"changes": {"color":"#FF0000"}}
createObject	Dodanie nowego obiektu do sceny: scene.push(object)	{"object": {"id":"obj2", "type":"circle", ...}}
deleteObject	Usunięcie obiektu: scene.remove(targetId)	{"type":"deleteObject"}
changePath	Zamiana ścieżki: object.path = newPath	{"newPath":"M 10,20 L 30,40"}



## III. ZASADY PROJEKTOWE WG SŁOWNIKA

Zasada Delt (Principle of Deltas)
Gdzie tylko możliwe, używaj różnic (delta) zamiast stanów absolutnych.
•	translate(delta=[x,y]) zamiast setPosition(x,y)
•	updateAttributes(changes) zamiast pełnej redefinicji obiektu
Niezależność Czasu (Time Agnosticism)
timestamp może być liczbą całkowitą, czasem fizycznym (ISO 8601) lub czasem logicznym.
JSON
"timeline": {
  "t0": [...],              // Notacja numeryczna
  "2024-07-01T12:00": [...] // Notacja czasowa
}
Semantyczna Neutralność Typów
Pole type w VectorObject nie wpływa na wykonanie transformacji. To użytkownik decyduje, jak interpretować typ.



## IV. ROZSZERZENIE O COGNITIVE VD

Korzystając z słownika, definiujemy transformacje dla AI.
JSON
{
  "type": "updateAttributes",
  "targetId": "concept_VectorDiff",
  "changes": {
    "weight": 9.7,
    "links": ["JSON", "SVG", "Kolmogorov"]
  }
}
Reguła semantyczna:
Python
def execute_updateAttributes(scene, transformation):
    obj = find_object_by_id(scene, transformation.targetId)
    for key, value in transformation.changes.items():
        if key in ["links", "weights"]:   # Atrybuty specjalne
            obj.attributes[key] = merge_semantic_net(value)
        else:
            obj.attributes[key] = value   # Nadpisanie standardowe 



## V. PEŁNA SPECYFIKACJA W JSON SCHEMA

JSON
{
  "$schema": "[http://json-schema.org/draft-07/schema#](http://json-schema.org/draft-07/schema#)",
  "title": "VectorDiff Specification",
  "type": "object",
  "required": ["baseScene", "timeline"],
  "properties": {
    "baseScene": {
      "type": "array",
      "items": { "$ref": "#/definitions/VectorObject" }
    },
    "timeline": {
      "type": "object",
      "patternProperties": {
        "^t\\d+$|^\\d{4}-": {
          "type": "array",
          "items": { "$ref": "#/definitions/Transformation" }
        }
      }
    }
  },
  "definitions": {
    "VectorObject": {
      "type": "object",
      "required": ["id", "type"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$" },
        "type": { "type": "string" },
        "attributes": { "type": "object" }
      }
    },
    "Transformation": {
      "type": "object",
      "required": ["type", "targetId"],
      "oneOf": [
        { "$ref": "#/definitions/Translate" },
        { "$ref": "#/definitions/UpdateAttributes" }
      ]
    },
    "Translate": {
      "type": "object",
      "properties": {
        "type": { "const": "translate" },
        "delta": { 
          "type": "array",
          "items": [{ "type": "number" }, { "type": "number" }],
          "minItems": 2,
          "maxItems": 2
        }
      }
    }
  }
}


## VI. PRZYKŁAD: ANIMACJA FIZYCZNA WG SŁOWNIKA

JSON
{
  "baseScene": [
    {
      "id": "particle_1",
      "type": "physics_particle",
      "attributes": { "position": [0, 0], "velocity": [1, 0], "color": "#FF0000" }
    }
  ],
  "timeline": {
    "t1": [
      {
        "type": "updateAttributes",
        "targetId": "particle_1",
        "changes": { "velocity": [1, 0.5] }
      }
    ],
    "t2": [
      {
        "type": "translate",
        "targetId": "particle_1",
        "delta": [2, 1]
      }
    ]
  }
}

