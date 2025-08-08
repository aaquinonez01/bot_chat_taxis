const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')

// 🚕 BASE DE DATOS TEMPORAL DE TAXISTAS (en memoria)
let taxistasRegistrados = [
    {
        numero: '593983983250@s.whatsapp.net',
        nombre: 'Jordan Talahua',
        lat: -16.5000,
        lng: -68.1500,
        disponible: true,
        placa: 'ABC-123'
    },
    {
        numero: '59178905678@s.whatsapp.net', 
        nombre: 'María López',
        lat: -16.5100,
        lng: -68.1600,
        disponible: true,
        placa: 'XYZ-456'
    },
    {
        numero: '59178909876@s.whatsapp.net',
        nombre: 'Juan Pérez',
        lat: -16.4900,
        lng: -68.1400,
        disponible: true,
        placa: 'DEF-789'
    }
]

// 📋 ALMACENAR SERVICIOS ACTIVOS EN MEMORIA
let serviciosActivos = []

// 🔍 FUNCIÓN PARA ENCONTRAR TAXISTA MÁS CERCANO (placeholder)
async function encontrarTaxistaMasCercano(latCliente, lngCliente) {
    // Por ahora retorna el primer taxista disponible
    // Aquí después integrarás la API de Google Maps
    const taxistaDisponible = taxistasRegistrados.find(taxista => taxista.disponible)
    
    if (taxistaDisponible) {
        // Marcarlo como ocupado temporalmente
        taxistaDisponible.disponible = false
        
        // Simular que estará ocupado por 30 minutos
        setTimeout(() => {
            taxistaDisponible.disponible = true
        }, 30 * 60 * 1000)
    }
    
    return taxistaDisponible
}

// 📨 FUNCIÓN PARA NOTIFICAR AL TAXISTA
async function notificarTaxista(provider, taxistaNumero, datosCliente, servicioId) {
    const ubicacionTexto = datosCliente.coordenadas 
        ? `📍 Ubicación GPS: https://maps.google.com/?q=${datosCliente.coordenadas.lat},${datosCliente.coordenadas.lng}`
        : `📍 ${datosCliente.ubicacion}`
    
    const mensaje = `🚖 *NUEVO SERVICIO SOLICITADO*
    
👤 *Cliente:* ${datosCliente.nombre}
${ubicacionTexto}
📱 *Teléfono:* ${datosCliente.telefono}
📋 *Servicio #:* ${servicioId}
⏰ *Hora:* ${new Date().toLocaleString()}

*¿Aceptas el servicio?*
Responde *SI* para aceptar o *NO* para rechazar

⏰ *Tienes 2 minutos para responder*`

    await provider.sendText(taxistaNumero, mensaje)
    
    // Configurar timeout de 2 minutos para auto-rechazo
    setTimeout(async () => {
        const servicio = serviciosActivos.find(s => s.id === servicioId && s.estado === 'pendiente')
        if (servicio) {
            // Auto-rechazar y buscar otro taxista
            const taxista = taxistasRegistrados.find(t => t.numero === taxistaNumero)
            if (taxista) {
                taxista.disponible = true
            }
            
            const servicioIndex = serviciosActivos.findIndex(s => s.id === servicioId)
            if (servicioIndex !== -1) {
                serviciosActivos.splice(servicioIndex, 1)
                
                // Buscar otro taxista
                const nuevoTaxista = await encontrarTaxistaMasCercano(
                    datosCliente.coordenadas ? datosCliente.coordenadas.lat : null,
                    datosCliente.coordenadas ? datosCliente.coordenadas.lng : null
                )
                
                if (nuevoTaxista) {
                    const nuevoServicio = guardarServicio(datosCliente, nuevoTaxista)
                    await notificarTaxista(provider, nuevoTaxista.numero, datosCliente, nuevoServicio.id)
                    
                    await provider.sendText(datosCliente.numeroCliente,
                        `🔄 *Buscando otro conductor...*\n\nEl conductor anterior no respondió a tiempo.\nTu solicitud sigue activa.`)
                } else {
                    await provider.sendText(datosCliente.numeroCliente,
                        `❌ *Lo sentimos*\n\nNo encontramos conductores disponibles.\nPor favor intenta nuevamente escribiendo *menu*`)
                }
            }
        }
    }, 2 * 60 * 1000) // 2 minutos
}

// 💾 FUNCIÓN PARA GUARDAR SERVICIO
function guardarServicio(datosCliente, taxista) {
    const servicio = {
        id: Date.now(),
        cliente: datosCliente,
        taxista: taxista,
        estado: 'pendiente',
        fechaCreacion: new Date()
    }
    serviciosActivos.push(servicio)
    return servicio
}

// 🚖 FLUJO PARA PEDIR SERVICIO
const flowPedirServicio = addKeyword(['1'])
    .addAnswer(
        '📝 *Para solicitar tu taxi necesito algunos datos...*\n\n¿Cuál es tu *nombre completo*?',
        { capture: true },
        async (ctx, { flowDynamic, state }) => {
            console.log('🎯 PASO 1: Capturando nombre')
            console.log('ctx.body (nombre):', ctx.body)
            console.log('ctx.from:', ctx.from)
            
            await state.update({ nombre: ctx.body })
            return await flowDynamic(`Perfecto *${ctx.body}*! 📍 Ahora necesito tu ubicación...`)
        }
    )
    .addAnswer(
        '📍 *Comparte tu ubicación*\n\nPuedes:\n• Usar el botón de ubicación de WhatsApp 📎\n',
        { capture: true },
        async (ctx, { flowDynamic, state, fallBack, provider, endFlow }) => {
            console.log('🎯 PASO 2: Capturando ubicación')
            console.log('ctx.body:', ctx.body)
            console.log('¿Tiene locationMessage?:', !!ctx.message?.locationMessage)
            console.log('ctx.from:', ctx.from)
            
            let ubicacionTexto = ''
            let coordenadas = null
            
            // Verificar si se envió una ubicación de WhatsApp (tiene coordenadas)
            if (ctx.message?.locationMessage) {
                const lat = ctx.message.locationMessage.degreesLatitude
                const lng = ctx.message.locationMessage.degreesLongitude
                coordenadas = { lat, lng }
                ubicacionTexto = `📍 Ubicación GPS: ${lat}, ${lng}`
                
                // Imprimir coordenadas en consola
                console.log(`📍 UBICACIÓN RECIBIDA:`)
                console.log(`   👤 Cliente: ${ctx.from}`)
                console.log(`   🌍 Latitud: ${lat}`)
                console.log(`   🌍 Longitud: ${lng}`)
                console.log(`   🔗 Google Maps: https://maps.google.com/?q=${lat},${lng}`)
                console.log(`   ⏰ Hora: ${new Date().toLocaleString()}`)
                console.log('----------------------------------------')
                
                await state.update({ 
                    ubicacion: ubicacionTexto,
                    coordenadas: coordenadas
                })
                
                // Procesar solicitud inmediatamente después de ubicación
                await state.update({ 
                    numeroCliente: ctx.from,
                    fechaSolicitud: new Date()
                })
                
                const datosCliente = state.getMyState()
                
                // No usar flowDynamic aquí - incluir mensaje en endFlow
                
                // Simular delay de búsqueda
                await new Promise(resolve => setTimeout(resolve, 2000))
                
                try {
                    // Encontrar taxista más cercano
                    const taxistaCercano = await encontrarTaxistaMasCercano(coordenadas.lat, coordenadas.lng)
                    
                    if (taxistaCercano) {
                        // Guardar el servicio
                        const servicio = guardarServicio(datosCliente, taxistaCercano)
                        
                        // Notificar al taxista
                        await notificarTaxista(provider, taxistaCercano.numero, datosCliente, servicio.id)
                        
                        console.log('🔚 TERMINANDO FLUJO EXITOSAMENTE')
                        return endFlow({
                            body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                                  '✅ *¡Perfecto! Taxista encontrado:*\n\n' +
                                  `🚖 *Conductor:* ${taxistaCercano.nombre}\n` +
                                  `🚗 *Placa:* ${taxistaCercano.placa}\n` +
                                  `📋 *Servicio #:* ${servicio.id}\n\n` +
                                  '⏳ *Hemos notificado al conductor*\n' +
                                  'Te confirmaremos cuando acepte el servicio.\n\n' +
                                  '📱 *Mantén tu teléfono disponible*'
                        })
                    } else {
                        console.log('🔚 TERMINANDO FLUJO - NO HAY TAXISTAS')
                        return endFlow({
                            body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                                  '❌ *Lo sentimos*\n\n' +
                                  'No hay taxistas disponibles en este momento.\n\n' +
                                  '🕐 Intenta nuevamente en unos minutos\n' +
                                  'Escribe *menu* para volver al inicio.'
                        })
                    }
                } catch (error) {
                    console.log('Error buscando taxista:', error)
                    console.log('🔚 TERMINANDO FLUJO - ERROR')
                    return endFlow({
                        body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                              '❌ *Error del sistema*\n\n' +
                              'No pudimos procesar tu solicitud.\n\n' +
                              'Por favor intenta nuevamente escribiendo *menu*'
                    })
                }
            }
            
            // Si es texto, validar que sea una dirección descriptiva
            if (!ctx.body || ctx.body.length < 15) {
                return fallBack('❌ Por favor proporciona una ubicación más específica:\\n\\n• Usa el botón 📎 para enviar tu ubicación GPS\\n• O describe tu dirección con referencias (ej: "Av. Arce #123, cerca del mercado central")')
            }
            
            // Guardar ubicación como texto y procesar
            ubicacionTexto = ctx.body
            await state.update({ 
                ubicacion: ubicacionTexto,
                coordenadas: null,
                numeroCliente: ctx.from,
                fechaSolicitud: new Date()
            })
            
            const datosCliente = state.getMyState()
            
            // No usar flowDynamic aquí - incluir mensaje en endFlow
            
            // Simular delay de búsqueda
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            try {
                // Encontrar taxista (sin coordenadas específicas)
                const taxistaCercano = await encontrarTaxistaMasCercano(null, null)
                
                if (taxistaCercano) {
                    // Guardar el servicio
                    const servicio = guardarServicio(datosCliente, taxistaCercano)
                    
                    // Notificar al taxista
                    await notificarTaxista(provider, taxistaCercano.numero, datosCliente, servicio.id)
                    
                    console.log('🔚 TERMINANDO FLUJO EXITOSAMENTE (TEXTO)')
                    return endFlow({
                        body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                              '✅ *¡Perfecto! Taxista encontrado:*\n\n' +
                              `🚖 *Conductor:* ${taxistaCercano.nombre}\n` +
                              `🚗 *Placa:* ${taxistaCercano.placa}\n` +
                              `📋 *Servicio #:* ${servicio.id}\n\n` +
                              '⏳ *Hemos notificado al conductor*\n' +
                              'Te confirmaremos cuando acepte el servicio.\n\n' +
                              '📱 *Mantén tu teléfono disponible*'
                    })
                } else {
                    console.log('🔚 TERMINANDO FLUJO - NO HAY TAXISTAS (TEXTO)')
                    return endFlow({
                        body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                              '❌ *Lo sentimos*\n\n' +
                              'No hay taxistas disponibles en este momento.\n\n' +
                              '🕐 Intenta nuevamente en unos minutos\n' +
                              'Escribe *menu* para volver al inicio.'
                    })
                }
            } catch (error) {
                console.log('Error buscando taxista:', error)
                console.log('🔚 TERMINANDO FLUJO - ERROR (TEXTO)')
                return endFlow({
                    body: '🔍 *Buscando taxista disponible...*\n⏳ Un momento por favor...\n\n' +
                          '❌ *Error del sistema*\n\n' +
                          'No pudimos procesar tu solicitud.\n\n' +
                          'Por favor intenta nuevamente escribiendo *menu*'
                })
            }
        }
    )

// 📞 FLUJO DE CONTACTO
const flowContacto = addKeyword(['2'])
    .addAnswer([
        '📞 *INFORMACIÓN DE CONTACTO*',
        '',
        '☎️ *Teléfono:* +591 2 234-5678',
        '📱 *WhatsApp:* +591 789-12345',
        '📧 *Email:* contacto@taxicooperativa.com',
        '🏢 *Oficina:* Av. Principal #123, La Paz',
        '',
        '🕐 *Horario:* Las 24 horas, todos los días',
        '',
        '',
        '📱 Escribe *menu* para volver al inicio'
    ],
    null,
    async (ctx, { gotoFlow }) => {
        const mensaje = ctx.body?.toLowerCase()
        if (mensaje === 'menu' || mensaje === 'inicio') {
            return gotoFlow(flowPrincipal)
        } else if (mensaje === '1') {
            return gotoFlow(flowPedirServicio)
        } else if (mensaje === '3') {
            return gotoFlow(flowInformacion)
        }
    })

// ℹ️ FLUJO DE INFORMACIÓN
const flowInformacion = addKeyword(['3'])
    .addAnswer([
        'ℹ️ *COOPERATIVA TAXI*',
        '',
        '🚕 Servicio de taxi las 24 horas',
        '👥 Más de 100 conductores registrados',
        '⭐ Conductores verificados y capacitados',
        '💰 Tarifas competitivas y transparentes',
        '📍 Cobertura en toda el área metropolitana',
        '🛡️ Seguro contra accidentes incluido',
        '',
        '🎯 *Nuestro compromiso:*',
        '• Puntualidad garantizada',
        '• Vehículos en excelente estado',
        '• Atención personalizada',
        '',
        '',
        '📱 Escribe *menu* para volver al inicio'
    ],
    null,
    async (ctx, { gotoFlow }) => {
        const mensaje = ctx.body?.toLowerCase()
        if (mensaje === 'menu' || mensaje === 'inicio') {
            return gotoFlow(flowPrincipal)
        } else if (mensaje === '1') {
            return gotoFlow(flowPedirServicio)
        } else if (mensaje === '2') {
            return gotoFlow(flowContacto)
        }
    })

// 📍 FLUJO PARA MANEJAR UBICACIONES GPS
const flowLocation = addKeyword(EVENTS.LOCATION)
    .addAnswer(
        '',
        null,
        async (ctx, { endFlow }) => {
            // Este flujo maneja ubicaciones GPS pero no debe interferir
            // con el flujo principal. Solo devuelve un endFlow silencioso.
            return endFlow()
        }
    )

// 🔄 FLUJO DE FALLBACK (para mensajes no reconocidos)
const flowFallback = addKeyword(EVENTS.ACTION)
    .addAnswer(
        [
            '❓ *No entendí tu mensaje*',
            '',
            'Por favor selecciona una opción:',
            '',
            '🚖 *1* - Pedir un servicio de taxi',
            '📞 *2* - Información de contacto', 
            'ℹ️ *3* - Sobre nosotros',
            '',
            'O escribe *menu* para ver las opciones 📋'
        ],
        null,
        async (ctx, { gotoFlow, endFlow }) => {
            // Filtrar eventos internos de ubicación y otros eventos del sistema
            if (ctx.body?.startsWith('_event_') || ctx.message?.locationMessage) {
                console.log('🔇 Evento interno ignorado en fallback:', ctx.body)
                return endFlow() // Ignorar silenciosamente
            }
            
            // LOG DE DEBUGGING PARA FALLBACK
            console.log('🚨 FALLBACK REAL ACTIVADO 🚨')
            console.log('ctx.body en fallback:', ctx.body)
            console.log('ctx.from:', ctx.from)
            console.log('========================')
            
            const mensaje = ctx.body?.toLowerCase()
            // Si el usuario escribe un número válido, redirigir al flujo correspondiente
            
            if (mensaje === '1') {
                return gotoFlow(flowPedirServicio)
            } else if (mensaje === '2') {
                return gotoFlow(flowContacto)
            } else if (mensaje === '3') {
                return gotoFlow(flowInformacion)
            } else if (mensaje === 'menu' || mensaje === 'inicio') {
                return gotoFlow(flowPrincipal)
            }
        }
    )

// ✅ FUNCIÓN PARA VERIFICAR SI ES TAXISTA
function esTaxista(numeroUsuario) {
    return taxistasRegistrados.some(taxista => taxista.numero === numeroUsuario)
}

// ✅ FLUJOS PARA RESPUESTAS DE TAXISTAS (solo taxistas registrados)
const flowAceptarServicio = addKeyword(['SI', 'si', 'SÍ', 'sí', 'acepto', 'aceptar', 'ACEPTO'])
    .addAnswer(
        '',
        null,
        async (ctx, { provider, flowDynamic, endFlow }) => {
            // Verificar si es taxista registrado
            if (!esTaxista(ctx.from)) {
                return endFlow({
                    body: '❓ *No entendí tu mensaje*\n\nPor favor selecciona una opción:\n\n🚖 *1* - Pedir servicio\n📞 *2* - Contacto\nℹ️ *3* - Información\n\nO escribe *menu* para ver opciones 📋'
                })
            }
            
            // Buscar servicio pendiente de este taxista
            const servicio = serviciosActivos.find(s => 
                s.taxista.numero === ctx.from && s.estado === 'pendiente'
            )
            
            if (servicio) {
                servicio.estado = 'aceptado'
                
                // Notificar al cliente
                await provider.sendText(servicio.cliente.numeroCliente, 
                    `✅ *¡Tu taxi ha sido confirmado!*\n\n🚖 *Conductor:* ${servicio.taxista.nombre}\n🚗 *Placa:* ${servicio.taxista.placa}\n📋 *Servicio #:* ${servicio.id}\n\n🕐 *Tu conductor llegará pronto*\n📱 Mantén tu teléfono disponible`)
                
                return await flowDynamic('✅ *¡Servicio aceptado correctamente!*\n\nEl cliente ha sido notificado con tus datos.')
            } else {
                return await flowDynamic('❌ No tienes servicios pendientes por aceptar.')
            }
        }
    )

const flowRechazarServicio = addKeyword(['NO', 'no', 'rechazar', 'rechazo', 'RECHAZO'])
    .addAnswer(
        '',
        null,
        async (ctx, { provider, flowDynamic, endFlow }) => {
            // Verificar si es taxista registrado
            if (!esTaxista(ctx.from)) {
                return endFlow({
                    body: '❓ *No entendí tu mensaje*\n\nPor favor selecciona una opción:\n\n🚖 *1* - Pedir servicio\n📞 *2* - Contacto\nℹ️ *3* - Información\n\nO escribe *menu* para ver opciones 📋'
                })
            }
            
            // Marcar al taxista como disponible nuevamente
            const taxista = taxistasRegistrados.find(t => t.numero === ctx.from)
            if (taxista) {
                taxista.disponible = true
            }
            
            // Buscar y cancelar servicio pendiente
            const servicioIndex = serviciosActivos.findIndex(s => 
                s.taxista.numero === ctx.from && s.estado === 'pendiente'
            )
            
            if (servicioIndex !== -1) {
                const servicio = serviciosActivos[servicioIndex]
                serviciosActivos.splice(servicioIndex, 1)
                
                // Buscar otro taxista para el cliente
                const nuevoTaxista = await encontrarTaxistaMasCercano(null, null)
                if (nuevoTaxista) {
                    const nuevoServicio = guardarServicio(servicio.cliente, nuevoTaxista)
                    await notificarTaxista(provider, nuevoTaxista.numero, servicio.cliente, nuevoServicio.id)
                    
                    await provider.sendText(servicio.cliente.numeroCliente,
                        `🔄 *Buscando otro conductor...*\n\nTu solicitud sigue activa.\nTe notificaremos cuando encontremos un taxista disponible.`)
                } else {
                    await provider.sendText(servicio.cliente.numeroCliente,
                        `❌ *Lo sentimos*\n\nNo hay más taxistas disponibles en este momento.\n\nPor favor intenta nuevamente más tarde escribiendo *menu*`)
                }
                
                return await flowDynamic('❌ *Servicio rechazado*\n\nBuscaremos otro conductor para el cliente.')
            } else {
                return await flowDynamic('❌ No tienes servicios pendientes por rechazar.')
            }
        }
    )

// 🏠 FLUJO DE BIENVENIDA (PRIMER MENSAJE)
const flowBienvenida = addKeyword(EVENTS.WELCOME)
    .addAnswer(
        '',
        null,
        async (ctx, { endFlow }) => {
            // Filtrar eventos internos de ubicación y otros eventos del sistema
            if (ctx.body?.startsWith('_event_') || ctx.message?.locationMessage) {
                console.log('🔇 Evento interno ignorado:', ctx.body)
                return endFlow() // Ignorar silenciosamente
            }
            
            console.log('✅ BIENVENIDA REAL ACTIVADA')
            console.log('ctx.body en bienvenida:', ctx.body)
            console.log('ctx.from:', ctx.from)
            console.log('========================')
        }
    )
    .addAnswer(
        '🚕 ¡Bienvenido a *COOPERATIVA TAXI*!'
    )
    .addAnswer(
        [
            '¿En qué podemos ayudarte hoy?',
            '',
            '🚖 *1* - Pedir un servicio de taxi',
            '📞 *2* - Información de contacto', 
            'ℹ️ *3* - Sobre nosotros',
            '',
            'Selecciona una opción escribiendo el número 👆'
        ]
    )

// 🏠 FLUJO PRINCIPAL (MENÚ DE INICIO)
const flowPrincipal = addKeyword(['menu', 'inicio', 'volver'])
    .addAnswer(
        [
            '🚕 *MENÚ PRINCIPAL*',
            '',
            '🚖 *1* - Pedir un servicio de taxi',
            '📞 *2* - Información de contacto', 
            'ℹ️ *3* - Sobre nosotros',
            '',
            'Selecciona una opción escribiendo el número 👆'
        ],
        null,
        async (ctx, { gotoFlow }) => {
            const mensaje = ctx.body?.toLowerCase()
            if (mensaje === '1') {
                return gotoFlow(flowPedirServicio)
            } else if (mensaje === '2') {
                return gotoFlow(flowContacto)
            } else if (mensaje === '3') {
                return gotoFlow(flowInformacion)
            }
        }
    )

// 🤖 FUNCIÓN PRINCIPAL
const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([
        flowBienvenida,
        flowPrincipal,
        flowPedirServicio,
        flowContacto, 
        flowInformacion,
        flowLocation,
        flowFallback,
        flowAceptarServicio,
        flowRechazarServicio
    ])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
    
    console.log('🚕 Bot de Cooperativa Taxi iniciado correctamente!')
    console.log('📱 Escanea el código QR para comenzar')
    console.log('🔗 Panel web disponible en: http://localhost:3000')
}

main()