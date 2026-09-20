# Casa Pepe — Master

Equipo, esta es la propuesta de trabajo para **Casa Pepe**, nuestro proyecto para HackSpain.

Vamos a construir un coordinador de incidentes con IA para un escenario ficticio: **un misil provoca una caída de la región de AWS donde corre nuestra aplicación**. El sistema debe detectar el impacto, decidir qué atender primero, coordinar la respuesta y cambiar de plan cuando aparezca nueva información. Una persona podrá supervisarlo e intervenir. El sistema también debe aprender de interacciones anteriores y utilizar ese aprendizaje en decisiones posteriores.

## 1. Escenario y objetivo de la demo

Necesitamos concretar qué negocio estamos ayudando. Propuesta: una empresa de reparto pierde la asignación de rutas y el seguimiento de paquetes. La capacidad de respaldo no permite recuperar ambos servicios a la vez.

Antes de implementar, debemos acordar:

- Qué servicios fallan y cómo afectan al negocio.
- Qué dependencias tiene cada servicio.
- Qué recursos quedan disponibles.
- Qué información conoce el agente al principio y cuál descubre después.
- Qué cambio inesperado obliga a revisar el plan.
- Qué consideramos una recuperación satisfactoria.

El misil da contexto a la historia. La decisión interesante es **qué recuperamos primero, con qué recursos y qué dejamos esperando**.

## 2. Harness: entorno que controla la simulación

Es el componente que mantiene el estado del incidente y permite repetir la demo.

Necesitamos:

- Estado de servicios, dependencias y capacidad disponible.
- Eventos con hora, origen y contenido.
- Un escenario inicial reproducible.
- Controles para iniciar el incidente, introducir cambios y reiniciar.
- Resultados coherentes para las acciones simuladas: éxito, fallo o recuperación parcial.
- Registro de decisiones, llamadas a herramientas y cambios de estado.
- Identificadores que permitan relacionar un evento con la decisión y la acción que provoca.
- Una forma de reproducir una ejecución anterior, claramente identificada como reproducción.
- Memoria persistente entre ejecuciones, con controles separados para reiniciar el incidente conservando lo aprendido o borrar la memoria de demo.

El giro principal será descubrir que **la capacidad de respaldo es insuficiente para ejecutar el plan inicial**.

## 3. Agente y lógica de decisión

El agente debe completar un ciclo de respuesta:

- Recoger información y distinguir hechos confirmados de información pendiente.
- Identificar los servicios afectados y sus dependencias.
- Priorizar según el impacto en el negocio y los recursos disponibles.
- Proponer acciones concretas, con responsable y motivo.
- Ejecutar las acciones permitidas y solicitar aprobación cuando corresponda.
- Incorporar respuestas de personas y herramientas.
- Revisar el plan cuando cambien las condiciones.
- Comprobar el resultado de cada acción antes de darla por completada.
- Comunicar qué se ha recuperado, qué sigue fallando y cuál es el siguiente paso.

Necesitamos límites de ejecución, tiempos de espera y un mecanismo para evitar acciones duplicadas o bucles sin progreso.

### Aprendizaje de interacciones anteriores — requisito del MVP

Guardar el historial no basta: el agente debe recuperar aprendizajes relevantes y utilizarlos para decidir qué preguntar, a quién contactar o qué acción intentar en una situación posterior.

El ciclo mínimo será:

1. **Registrar la interacción y su resultado:** respuestas de llamadas, correcciones del operador y resultados verificados de herramientas y acciones.
2. **Extraer un aprendizaje concreto:** qué funcionó, qué falló o qué supuesto hubo que corregir, indicando la evidencia de origen y las condiciones en las que aplica. Un rechazo sin explicación no permite deducir una regla nueva.
3. **Persistirlo entre ejecuciones:** conservar contexto, fecha, fuente, grado de confianza y vigencia. Guardar solo la información necesaria, sin credenciales ni datos personales innecesarios.
4. **Consultar la memoria antes de decidir:** recuperar aprendizajes relevantes, contrastarlos con el estado actual y explicar si cambian la decisión. La disponibilidad de una persona o la capacidad de respaldo observadas antes deben volver a comprobarse.
5. **Corregir la memoria:** permitir al operador revisar, corregir o invalidar un aprendizaje; registrar los cambios y retirar los que contradiga nueva evidencia.

La memoria aporta contexto, pero no sustituye las comprobaciones actuales ni las aprobaciones requeridas. El contenido de una llamada se trata como información, no como instrucciones para modificar permisos o controles del sistema.

**Ejemplo para la demo:** en una primera ejecución, un ingeniero explica que recuperar la asignación de rutas requiere restaurar antes una cola, y el resultado de la recuperación confirma esa dependencia. En una segunda ejecución comparable, el agente recupera ese aprendizaje, comprueba que sigue aplicando y planifica la cola antes que el servicio. La UI muestra la interacción de origen y qué decisión ha cambiado.

Para el MVP basta con memoria estructurada y recuperación por contexto; no necesitamos entrenar un modelo. El aprendizaje entre ejecuciones forma parte de la entrega obligatoria del proyecto.

## 4. Herramientas e integraciones

Conjunto inicial propuesto:

| Herramienta | Función | Tipo de interacción previsto |
|---|---|---|
| `get_incident_state` | Consultar el estado del incidente | Harness |
| `get_service_health` | Consultar salud y dependencias | Datos simulados |
| `get_recovery_capacity` | Consultar capacidad de respaldo | Datos simulados |
| `contact_engineer` | Llamar a un compañero y recoger su respuesta | Llamada real con HappyRobot |
| `assign_task` | Crear una tarea con responsable y estado | Registro real en nuestra aplicación |
| `request_approval` | Pedir autorización al operador | Interacción real en la UI |
| `execute_recovery` | Ejecutar una acción de recuperación | Acción real en un entorno de pruebas |
| `verify_recovery` | Comprobar si la acción ha funcionado | Comprobación del entorno de pruebas |
| `get_relevant_learnings` | Recuperar aprendizajes aplicables al contexto actual | Memoria persistente en el servidor |
| `record_learning` | Guardar o actualizar un aprendizaje con evidencia y condiciones de aplicación | Memoria persistente en el servidor |

Cada herramienta necesita entradas y salidas definidas, estados de ejecución y errores comprensibles.

Debemos decidir qué acción concreta vamos a ejecutar en el entorno de pruebas. Por ejemplo, activar una instancia de respaldo de un servicio de demostración y comprobar que responde.

## 5. Interfaz de operaciones

Una pantalla principal, organizada en estas zonas:

- **Resumen del incidente:** estado, región afectada e impacto en el negocio.
- **Servicios y recursos:** qué falla, qué depende de qué y qué capacidad queda.
- **Plan actual:** prioridades, acciones, responsables y estado de cada paso.
- **Actividad en directo:** eventos recibidos, llamadas a herramientas y resultados.
- **Decisiones:** explicación breve de cada elección, basada en evidencias y restricciones.
- **Aprobaciones:** acción propuesta, consecuencias y controles para aprobar o rechazar.
- **Aprendizajes:** evidencia de origen, vigencia, decisiones que los utilizan y controles para corregirlos o invalidarlos.
- **Cambio de plan:** qué ha cambiado respecto al plan anterior y por qué.
- **Controles de demo:** iniciar, introducir el giro y reiniciar, separados de los controles del operador.

La interfaz debe distinguir entre acciones propuestas, acciones en curso y acciones completadas. También debe indicar qué elementos son simulados.

## 6. Contrato compartido entre componentes

Esto es lo primero que debemos cerrar para poder trabajar en paralelo.

Entidades mínimas:

- `Incident`: incidente e impacto.
- `Service`: salud y dependencias.
- `Resource`: capacidad disponible y asignada.
- `PlanStep`: acción, prioridad, responsable y estado.
- `ActivityEvent`: evento con identificador, fecha, tipo, origen y contenido.
- `ToolCall`: ejecución, parámetros, resultado y error.
- `Approval`: acción pendiente y decisión del operador.
- `Learning`: aprendizaje, contexto de aplicación, evidencia de origen, fecha, confianza, vigencia y estado de revisión.
- Referencias desde cada decisión a los aprendizajes utilizados, con el motivo de su aplicación o descarte.

También necesitamos acordar:

- Cómo consulta la UI el estado inicial.
- Cómo recibe las actualizaciones en directo.
- Cómo llegan las aprobaciones al agente.
- Cómo se introducen eventos y se reinicia la simulación.
- Cómo se consultan, guardan, corrigen e invalidan aprendizajes y cómo se conserva o borra la memoria al reiniciar.
- Qué estados y formatos de error utiliza cada componente.
- Un juego de datos de ejemplo común para desarrollar la UI sin esperar al backend.

## 7. Infraestructura y configuración

- Acceso a HappyRobot y configuración de la llamada de demostración.
- Credenciales en variables de entorno y un `.env.example` sin secretos.
- Un entorno de pruebas para ejecutar y verificar la recuperación.
- Un despliegue accesible para enseñar la demo.
- Almacenamiento persistente de aprendizajes en el servidor, con acceso autorizado y separado por entorno o equipo.
- El coordinador y la interfaz disponibles fuera del entorno que simulamos como afectado.
- Instrucciones para arrancar, configurar y reiniciar el proyecto.
- Registro de errores suficiente para resolver problemas durante los ensayos.

## 8. Guion de la demo

Secuencia propuesta:

1. Mostramos el sistema funcionando con normalidad.
2. Introducimos el impacto del misil y aparecen los fallos.
3. El agente evalúa el impacto y prepara un primer plan.
4. Llama a un compañero a través de HappyRobot y registra la información recibida.
5. Introducimos la limitación de capacidad de respaldo.
6. El agente cambia las prioridades y explica qué pospone.
7. El operador aprueba la acción propuesta.
8. El sistema ejecuta la recuperación en el entorno de pruebas.
9. Comprueba el resultado y muestra qué se ha recuperado y qué sigue pendiente.
10. Muestra un aprendizaje extraído de la interacción con el ingeniero y respaldado por el resultado.
11. Reiniciamos el incidente conservando la memoria: el agente utiliza ese aprendizaje y explica cómo cambia su siguiente decisión respecto a la primera ejecución.

Necesitamos una persona presentando y otra controlando los eventos. Debemos ensayar también qué hacemos si la llamada o una integración falla.

## 9. Validación y criterios de terminado

La demo estará lista cuando podamos comprobar que:

- El escenario se reinicia de forma fiable.
- Un evento aparece en la UI y provoca una respuesta del agente.
- Una limitación nueva cambia realmente el plan.
- La llamada de HappyRobot funciona y su resultado llega al sistema.
- El operador puede aprobar o rechazar una acción.
- El agente respeta esa decisión.
- La acción de recuperación se ejecuta y su resultado se verifica.
- Los fallos y tiempos de espera quedan visibles.
- El registro permite reconstruir lo ocurrido.
- Una interacción con resultado verificado produce un aprendizaje persistente y trazable.
- Dos ejecuciones con el mismo escenario y los mismos eventos, una sin memoria y otra con el aprendizaje anterior, muestran un cambio de decisión explicable.
- Los aprendizajes irrelevantes, invalidados o contradichos por el estado actual no se aplican; la memoria nunca evita una aprobación requerida.
- El operador puede corregir o invalidar un aprendizaje y las decisiones posteriores respetan el cambio.
- Reiniciar el incidente conserva la memoria cuando se solicita; borrar la memoria permite repetir la ejecución de referencia.
- Podemos completar varios ensayos seguidos sin corregir el estado manualmente.

## 10. Reparto del trabajo

| Frente | Responsabilidad | Primera entrega |
|---|---|---|
| **UI** | Pantalla de operaciones, actividad, aprobaciones, aprendizajes y controles de demo | Pantalla funcional con datos de ejemplo |
| **Harness y backend** | Estado, eventos, simulación, reinicio, memoria persistente y actualizaciones en directo | Escenario reproducible con el giro de capacidad |
| **Agente e integraciones** | Lógica de decisión, herramientas, HappyRobot, recuperación y extracción y uso de aprendizajes | Ciclo completo de decisión, ejecución y verificación |
| **Integración y demo** | Conectar componentes, desplegar, validar y preparar la presentación | Demo completa desde un reinicio limpio |

Si somos tres desarrollando, podemos unir integración con el frente de harness. En cualquier caso, **una persona debe responsabilizarse de que la demo completa funcione**, además del trabajo de cada componente.

## 11. Orden de implementación

- **Primero:** cerrar escenario, contratos y responsables.
- **Después:** conectar un recorrido mínimo: evento → UI → propuesta del agente → aprobación → acción → resultado.
- **A continuación:** integrar HappyRobot y el cambio de plan por falta de capacidad.
- **Después del ciclo completo:** persistir aprendizajes, recuperarlos al decidir y validar la segunda ejecución con memoria.
- **Por último:** mejorar la presentación visual, preparar la alternativa de reproducción y ensayar.

Dejamos como extras más escenarios y las estadísticas históricas.

## Estado de implementación en `main`

La arquitectura descrita en este documento ya tiene una implementación funcional en `apps/server`: NestJS es el único backend y reúne el estado persistido del incidente, la simulación manual y aleatoria reproducible mediante semilla, el ciclo de decisión basado en reglas, los planes versionados, las aprobaciones, las tareas, las herramientas, las integraciones, la actividad, el aprendizaje y las reproducciones. `apps/web` consume el backend mediante rutas proxy del servidor y recibe la actividad por SSE.

El recorrido principal está cubierto en modo simulado: iniciar una ejecución, aplicar el impacto, crear y revisar el plan, contactar al ingeniero, introducir la limitación de capacidad, solicitar una aprobación, ejecutar y verificar la recuperación y consultar el informe. HappyRobot, Resend y el entorno HTTP de recuperación requieren configuración y validación de extremo a extremo; por defecto no se contacta a proveedores externos.

El aprendizaje persistido actual cubre observaciones de capacidad sobreestimada y resultados de recuperación, y la capacidad histórica puede influir en planes posteriores. La revisión e invalidación manual de aprendizajes y la validación pública de proveedores siguen siendo trabajo de demo/despliegue, no deben darse por resueltas solo porque pasen las pruebas locales.

La presentación todavía no está terminada.

Referencias: [repositorio](https://github.com/SantiagoJimenezQ/hackspain-casa-pepe) · [reto oficial](https://hackspain2026.happyrobot.ai/)
