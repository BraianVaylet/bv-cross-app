# Migración v1 → v2 (F2-08)

Script one-shot que trae el usuario de bv-cross v1 (SQLite, identidad por alias)
a v2 (Mongo, identidad por email) con todo su historial.

## Uso

```bash
# 1) Dry-run (por defecto): imprime el plan, no escribe nada
pnpm --filter @bv/api db:migrate-v1 -- \
  --sqlite /ruta/a/bv-cross.db \
  --email braian@ejemplo.com \
  --name "Braian"

# 2) Ejecutar de verdad
pnpm --filter @bv/api db:migrate-v1 -- \
  --sqlite /ruta/a/bv-cross.db \
  --email braian@ejemplo.com \
  --name "Braian" \
  --commit
```

Requiere `MONGODB_URI` (y el resto de la config de la API) en el entorno o en `.env`.

### Opciones

| Flag | Para qué |
|---|---|
| `--sqlite <path>` | DB de v1 (se abre en **solo lectura**) |
| `--email <email>` | Email de la cuenta v2 a crear |
| `--name <nombre>` | Nombre para mostrar |
| `--alias <alias>` | Elegir el usuario v1 si la DB tiene más de uno |
| `--link-user <id>` | Adjuntar los datos a una cuenta v2 **ya existente** en vez de crear una |
| `--commit` | Ejecutar (sin este flag es dry-run) |

## Qué hace el mapeo

| v1 | v2 |
|---|---|
| `users` (alias) | `users` con el email del CLI, `emailVerifiedAt: now` (el dueño es confiable) y **password aleatoria** — el hash de v1 no se migra porque cambia el esquema de identidad |
| `exercises` | `exercises` `scope:'personal'`, `ownerUserId`, `type: gimnastico ? 'reps' : 'weight'`, `notes: observacion`, sin org |
| `exercises.dolor = 1` | v2 modela el dolor **por registro** (`painFlag`), así que a nivel ejercicio se anota en `notes`: `"v1: marcado con dolor"` |
| `rm_entries` | `rmEntries` con `kg`/`reps` según el tipo, `date`, `comment`, `orgId: null` (RN-21) y `createdAt` preservado |

**La password no se migra**: tras el `--commit`, el dueño entra con
"olvidé mi contraseña" y define la suya.

## Validaciones y datos sucios

- Aborta si el email ya tiene cuenta en v2 (salvo que pases `--link-user`).
- Aborta si hay varios usuarios en v1 y no elegiste `--alias`.
- Una entry cuya medida no coincide con el tipo del ejercicio (por ejemplo, un
  ejercicio de peso con `rm_kg` nulo) **se excluye con warning y el resto migra**
  — se listan todas al final con su motivo.

## Verificación

Con `--commit` el script imprime al final:

- conteos v1 vs v2 (ejercicios y registros),
- spot-check de los 3 ejercicios con más historial: su RM/marca **vigente**
  (fecha más reciente, criterio RN-22) debe coincidir con v1.

## Rollback

Borra el usuario migrado con **todos** sus ejercicios y registros, en una
transacción:

```bash
pnpm --filter @bv/api db:migrate-v1 -- --rollback <userId>
```

El `<userId>` es el `_id` del usuario v2 (lo imprime la verificación, o se
busca por email en `users`).

> El script **no es idempotente**: correr `--commit` dos veces duplica los
> datos. Si tenés que reintentar, hacé el rollback primero.
