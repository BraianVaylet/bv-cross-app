# 01 — Documento Funcional

> Describe **cómo funciona el negocio**: quiénes usan la plataforma, qué pueden hacer, con qué reglas, y hacia dónde evoluciona el producto. Es la fuente de verdad funcional: si el código contradice este documento, el código está mal (o este documento debe actualizarse primero).

## 1. Visión de producto

Plataforma para que centros de CrossFit gestionen su negocio (clientes, clases, packs, pagos) y para que sus atletas gestionen su entrenamiento (reservas y registro de cargas). Modelo de negocio: **suscripción mensual por gimnasio** (el gimnasio paga, sus atletas usan las apps gratis).

**Propuesta de valor:**
- Para el dueño: menos WhatsApp y planillas; control de cupos, vencimientos y cobros en un solo lugar; datos de evolución de sus atletas como herramienta de retención.
- Para el atleta: reservar clase en 10 segundos, saber cuántas clases le quedan y cuándo vencen, y su historial de cargas siempre a mano en el box.

**Diferenciales frente a competidores** (Wodify, Boxmagic, Aimharder): precio para gimnasios chicos de LATAM, UX mobile-first en español, registro de cargas integrado a la operación del gimnasio (el coach ve la evolución real de cada atleta).

## 2. Actores y roles

| Rol | Quién es | Apps que usa |
|---|---|---|
| **Owner** | Dueño del gimnasio; contrata el servicio, da de alta la organización | CRM |
| **Admin** | Staff con permisos de gestión (recepción, manager) | CRM |
| **Coach** *(fase 2)* | Profesor; ve clases del día, marca asistencia, ve cargas de sus atletas | CRM (vista limitada) |
| **Athlete** | Cliente del gimnasio; entrena | bv-cross + bv-cross-schedule |

Un mismo **usuario** (una cuenta = un email) puede tener roles distintos en organizaciones distintas (ej.: owner de su gimnasio y athlete en otro).

## 3. Conceptos del dominio

- **Organización (org)**: un gimnasio. Tiene nombre, código de acceso, timezone, configuración (ventana de cancelación, etc.).
- **Código de organización (join code)**: string único legible (ej. `bahia-cross`) que el owner comparte con sus clientes para que vinculen su cuenta a la org. Regenerable si se filtra.
- **Membresía**: vínculo usuario ↔ organización con un rol y un estado. Acá viven las observaciones del admin sobre el cliente (lesiones, notas).
- **Plantilla de clase**: horario recurrente semanal (ej. "Lunes 18:00, Cross, 60 min, cupo 12").
- **Sesión de clase**: instancia concreta de una plantilla en una fecha (ej. "Lunes 7/7/2026 18:00"). Sobre las sesiones se reserva.
- **Pack (catálogo)**: producto que define el gimnasio: N clases, duración en días, precio, medio de pago (ej. "8 clases / 30 días / $25.000 / efectivo").
- **Pack asignado**: instancia de un pack en manos de un cliente, con fechas de inicio/vencimiento y contador de clases usadas. Es el "saldo" del atleta.
- **Reserva (booking)**: un atleta ocupa un lugar en una sesión de clase consumiendo 1 crédito de un pack asignado.
- **Ejercicio de organización**: ejercicio del catálogo del gimnasio, visible para todos sus atletas.
- **Ejercicio personal**: ejercicio creado por el atleta, visible solo para él.
- **Registro de carga (RM entry)**: peso máximo (kg) o repeticiones máximas (gimnástico) de un atleta en un ejercicio, con fecha y comentario.

## 4. Flujos principales

### F1 — Alta de un gimnasio (onboarding del owner)
1. El owner se registra con email + contraseña y verifica su email.
2. Crea su organización: nombre, timezone, configuración inicial. Queda como `owner`.
3. La plataforma genera el **código de organización** (editable/regenerable desde el CRM).
4. Wizard inicial: crear plantillas de clases → crear packs → invitar clientes.

### F2 — Alta de un atleta
1. El owner lo carga en el CRM (nombre, email, teléfono, observaciones) → queda como membresía `invited`, **o** el atleta se registra solo en bv-cross / bv-cross-schedule.
2. El atleta descarga/abre la app, se registra con su email y **ingresa el código de organización**.
3. Si su email ya estaba precargado por el gimnasio, se vincula a esa ficha (no se duplica); si no, se crea la membresía como `active`.
4. Desde ese momento ve el catálogo de ejercicios del gimnasio y puede recibir packs.

### F3 — Venta de un pack
1. En el CRM, el admin abre la ficha del cliente → "Asignar pack" → elige pack del catálogo, fecha de inicio (default hoy) y registra el pago (monto, medio, nota).
2. El sistema calcula el vencimiento (`inicio + durationDays`) y congela un **snapshot** del pack (precio y condiciones al momento de la venta).
3. El atleta ve en bv-cross-schedule su saldo: "8 clases disponibles · vence 01/08".

### F4 — Reserva de clase (el flujo crítico)
1. El atleta abre bv-cross-schedule → ve la grilla de la semana con cupos disponibles.
2. Toca una sesión → confirma → el sistema, **de forma atómica**: verifica cupo, verifica crédito disponible, descuenta 1 crédito del pack correcto y crea la reserva.
3. Puede cancelar mientras falten más de X horas (configurable por la org): el crédito vuelve.
4. "Editar" una reserva = cancelar + reservar otra (misma validación de ventana).

### F5 — Registro de cargas
1. El atleta abre bv-cross → ve los ejercicios del catálogo de su gimnasio + los personales.
2. Registra un RM (kg o reps) con fecha y comentario. Usa la calculadora de porcentajes sobre cualquier RM del historial.
3. El gimnasio ve esas cargas en el CRM (solo las de ejercicios del catálogo, ver RN-20) y la evolución del atleta.

### F6 — Operación diaria del gimnasio
1. El admin abre el CRM → dashboard del día: clases de hoy, reservas por clase, packs por vencer, clientes inactivos.
2. Ve la lista de anotados de cada clase.
3. *(fase 2)* Marca asistencia / no-show.

### F7 — Multi-organización (atleta en 2+ gimnasios)
1. Un atleta con membresías en 2+ orgs, al abrir cualquier app cliente, ve un **selector de organización**.
2. Todo lo que ve después (ejercicios, clases, packs) pertenece a la org seleccionada. Puede cambiar desde el menú.
3. Sus ejercicios personales y registros de carga sobre ellos son suyos, independientes de la org (RN-21).

## 5. Reglas de negocio (RN)

> Numeradas para referenciarlas desde tareas, tests y PRs. **Cada RN debe tener al menos un test automatizado.**

### Organizaciones y membresías
- **RN-01**: El código de organización es único global, case-insensitive, formato `[a-z0-9-]{4,32}`. El owner puede regenerarlo; el código viejo deja de servir de inmediato (las membresías existentes no se ven afectadas).
- **RN-02**: Un usuario tiene a lo sumo **una** membresía por organización.
- **RN-03**: Membresía `disabled`: el atleta no puede reservar ni ver datos de la org, pero su historial se conserva (reactivable).
- **RN-04**: Solo `owner` puede: regenerar código, cambiar configuración de la org, gestionar roles admin. `admin` puede todo lo demás (clientes, clases, packs, asignaciones).

### Clases y reservas
- **RN-05**: Las plantillas definen la grilla semanal; las sesiones se **materializan** automáticamente con N días de anticipación (default 14, configurable). Editar una plantilla afecta solo sesiones futuras sin reservas; las sesiones con reservas se modifican una por una.
- **RN-06**: El cupo de una sesión nunca puede excederse. La verificación cupo+crédito+reserva es **una operación atómica** (sin condiciones de carrera con reservas simultáneas).
- **RN-07**: Un atleta puede tener a lo sumo **una** reserva activa por sesión.
- **RN-08**: Cancelación por el atleta: permitida solo si faltan ≥ `cancellationWindowHours` (config de la org, default 2 h). Devuelve el crédito al pack de origen (incluso si el pack ya venció después de la reserva: el crédito vuelve pero seguirá inutilizable si el pack está vencido).
- **RN-09**: El gimnasio puede cancelar una sesión completa (ej. feriado): todas las reservas se cancelan y los créditos vuelven, sin importar la ventana.
- **RN-10**: No se puede reservar una sesión ya iniciada ni una sesión de fecha pasada.
- **RN-11**: Reservar requiere al menos un pack asignado `active` con crédito disponible **cuyo vencimiento sea posterior al momento de la reserva** (se valida contra la fecha de la reserva, no de la clase).

### Packs
- **RN-12**: Consumo de créditos: si el atleta tiene más de un pack activo con saldo, se consume del que **vence primero** (FIFO por vencimiento).
- **RN-13**: Estados de un pack asignado: `active` → `exhausted` (sin créditos) | `expired` (pasó el vencimiento) | `cancelled` (anulado por el admin, con nota). `exhausted` y `expired` son terminales.
- **RN-14**: Un pack del catálogo puede **editarse o borrarse solo si no tiene asignaciones vigentes** (`active`). Con asignaciones vigentes solo se permite editar campos que no afectan al cliente (nombre descriptivo interno, notas). Para "cambiar el precio": se archiva el pack y se crea uno nuevo.
- **RN-15**: Los packs archivados no se pueden asignar, pero permanecen visibles en el historial (registro de cómo evolucionaron los precios).
- **RN-16**: La asignación congela un **snapshot** del pack (nombre, clases, duración, precio, medio de pago): cambios futuros del catálogo jamás afectan asignaciones existentes.
- **RN-17**: Un cliente puede tener **múltiples packs asignados activos** a la vez, con fechas superpuestas o no.
- **RN-18**: El vencimiento se calcula como `startDate + durationDays` en la timezone de la organización, a las 23:59:59 del día de vencimiento.

### Ejercicios y cargas
- **RN-19**: El catálogo de la org es gestionado solo por admin/owner. Archivar un ejercicio del catálogo lo oculta para nuevos registros pero conserva el historial de los atletas.
- **RN-20**: Los ejercicios personales del atleta y sus registros **no son visibles para la organización**. La org solo ve registros sobre ejercicios de su catálogo.
- **RN-21**: Los ejercicios personales pertenecen al usuario (cross-org): los ve en cualquier org en la que esté. Los registros sobre ejercicios de catálogo pertenecen al contexto de esa org.
- **RN-22**: El RM "vigente" de un ejercicio es el de **fecha más reciente** (no el mayor valor). Herencia de v1.
- **RN-23**: Un registro es de peso (kg > 0) **o** de repeticiones (reps > 0 entero), según el tipo del ejercicio. Nunca ambos.

### Cuentas
- **RN-24**: Una cuenta = un email único (case-insensitive). El email debe verificarse antes de poder unirse a una organización.
- **RN-25**: Eliminar la cuenta: baja lógica + anonimización de datos personales; los agregados estadísticos de la org no se recalculan. (Cumplimiento Ley 25.326 AR / buenas prácticas de privacidad.)

## 6. Estadísticas por sección (CRM)

**Dashboard (home):** clases de hoy con ocupación, reservas de la semana, packs que vencen en 7 días, clientes sin reservas hace 14+ días (riesgo de churn), ingresos del mes (suma de pagos registrados).

**Clases:** ocupación promedio por horario/día (heatmap semanal), tasa de cancelación, horarios más y menos demandados, evolución de asistencia mensual.

**Clientes:** activos vs inactivos, altas y bajas por mes, frecuencia semanal promedio por cliente, ranking de asistencia.

**Packs:** ventas por pack por mes, ingresos por medio de pago, tasa de renovación (compró otro pack ≤7 días tras vencer el anterior), créditos vendidos vs consumidos (breakage).

**Ejercicios:** evolución de RM por atleta y ejercicio (gráfico temporal), últimos PRs del gimnasio (feed), ejercicios más registrados.

## 7. Fuera de alcance del MVP (roadmap)

Orden tentativo post-MVP:

1. **Cobros online con Mercado Pago**: el atleta compra el pack desde la app; webhooks de confirmación; conciliación en el CRM. (La estructura de `payment` en pack asignado ya lo contempla.)
2. **Asistencia**: check-in por el coach o QR en recepción; estados `attended`/`no_show`; política de penalidad por no-show configurable.
3. **Notificaciones**: recordatorio de clase (push PWA), aviso de vencimiento de pack, cupo liberado. Canal WhatsApp (API de Meta) como fase posterior.
4. **Lista de espera**: clase llena → cola FIFO; si alguien cancela, se notifica al primero.
5. **Rol coach**: vista del día, asistencia, cargas de sus atletas.
6. **WOD del día**: el gimnasio publica la rutina; el atleta la ve en bv-cross y registra resultados.
7. **Facturación del SaaS**: suscripción del gimnasio con MP/Stripe, planes por cantidad de atletas activos.
8. **Multi-sede**: una org con varias ubicaciones.

## 8. Métricas de éxito del producto

- **Activación**: % de gimnasios que crean ≥1 clase y ≥1 pack en la primera semana.
- **Adopción atleta**: % de miembros activos que reservan vía app (vs. WhatsApp/manual) al mes 2.
- **Retención**: churn mensual de gimnasios < 5%.
- **Norte técnico**: reservar una clase toma < 10 s y < 3 taps desde app abierta; p95 de API < 300 ms.
