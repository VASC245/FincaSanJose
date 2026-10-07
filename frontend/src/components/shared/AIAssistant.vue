<script setup lang="ts">
import { ref, nextTick, onUnmounted, watch } from 'vue'
import {
  Mic, MicOff, Send, X, Bot, Loader2, Trash2, Volume2, VolumeX,
  Headphones, CheckCircle2, AlertCircle, Square
} from 'lucide-vue-next'
import { sendMessage, type ConversationMessage, type AssistantAction } from '@/services/aiService'

// ─── State ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number
  role: 'user' | 'assistant'
  content: string
  actions?: AssistantAction[]
}

const STORAGE_KEY = 'finca-asistente-v1'
const MAX_SAVED = 40

const isOpen       = ref(false)
const messages     = ref<ChatMsg[]>([])
const history      = ref<ConversationMessage[]>([])
const input        = ref('')
const isLoading    = ref(false)
const toolStatus   = ref('')
const isListening  = ref(false)
const isSpeaking   = ref(false)
const interimText  = ref('')
const voiceEnabled = ref(true)
// Manos libres: después de responder en voz alta vuelve a escuchar solo
const handsFree    = ref(false)
const micError     = ref('')
const messagesEl   = ref<HTMLElement | null>(null)
let msgId = 0

const SUGGESTIONS = [
  '¿Qué toca hoy?',
  'Hoy dimos 115 litros',
  '¿Cuánta leche dimos este mes comparado con el anterior?',
  '¿Cuáles vacas están preñadas y cuándo paren?',
  '¿Cuánto gastamos este mes y en qué?',
  '¿Qué vaca está más cerca de parir?',
]

// ─── Conversación guardada en el teléfono ────────────────────────────────────
// Solo comodidad: si el navegador bloquea el almacenamiento, el chat funciona igual.

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { messages?: ChatMsg[]; history?: ConversationMessage[]; handsFree?: boolean; voiceEnabled?: boolean }
    messages.value = saved.messages ?? []
    history.value = saved.history ?? []
    handsFree.value = saved.handsFree ?? false
    voiceEnabled.value = saved.voiceEnabled ?? true
    msgId = messages.value.reduce((m, x) => Math.max(m, x.id + 1), 0)
  } catch { /* sin almacenamiento */ }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages: messages.value.slice(-MAX_SAVED),
      history: history.value.slice(-MAX_SAVED),
      handsFree: handsFree.value,
      voiceEnabled: voiceEnabled.value
    }))
  } catch { /* sin almacenamiento */ }
}

loadSaved()
watch([messages, history, handsFree, voiceEnabled], save, { deep: true })

// ─── TTS ──────────────────────────────────────────────────────────────────────

// Quita lo que suena mal leído en voz alta: markdown, viñetas, emojis, símbolos
function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[✓✗→]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Chrome corta las frases muy largas: se lee por oraciones, en cola
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?;:]+[.!?;:]*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const p of parts) {
    if ((current + p).length > 180 && current) { chunks.push(current.trim()); current = '' }
    current += p
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const preferred = ['es-EC', 'es-CO', 'es-419', 'es-MX', 'es-US']
  for (const lang of preferred) {
    const v = voices.find(x => x.lang.replace('_', '-') === lang)
    if (v) return v
  }
  return voices.find(v => v.lang.startsWith('es')) ?? null
}

function speak(text: string) {
  if (!voiceEnabled.value || !window.speechSynthesis) {
    afterSpeaking()
    return
  }
  window.speechSynthesis.cancel()
  const chunks = splitSentences(cleanForSpeech(text))
  if (!chunks.length) { afterSpeaking(); return }

  const voice = pickVoice()
  isSpeaking.value = true
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk)
    u.lang = voice?.lang ?? 'es-CO'
    u.rate = 1.05
    if (voice) u.voice = voice
    if (i === chunks.length - 1) {
      u.onend = () => { isSpeaking.value = false; afterSpeaking() }
      u.onerror = () => { isSpeaking.value = false }
    }
    window.speechSynthesis.speak(u)
  })
}

function stopSpeaking() {
  window.speechSynthesis?.cancel()
  isSpeaking.value = false
}

// En manos libres, al terminar de hablar vuelve a escuchar
function afterSpeaking() {
  if (handsFree.value && isOpen.value && !isLoading.value && !isListening.value) {
    setTimeout(() => { if (handsFree.value && isOpen.value) startListening() }, 300)
  }
}

function toggleVoice() {
  voiceEnabled.value = !voiceEnabled.value
  if (!voiceEnabled.value) stopSpeaking()
}

function toggleHandsFree() {
  handsFree.value = !handsFree.value
  micError.value = ''
  if (handsFree.value) {
    voiceEnabled.value = true
    if (!isListening.value && !isLoading.value) startListening()
  } else {
    stopListening()
  }
}

// ─── Scroll ───────────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

// ─── Send ─────────────────────────────────────────────────────────────────────

function friendlyError(err: string): string {
  if (/Failed to fetch|NetworkError|Load failed/i.test(err)) {
    return 'No pude conectarme. Revisa la señal e intenta de nuevo.'
  }
  if (/overloaded|529|rate|429/i.test(err)) {
    return 'El servicio está ocupado en este momento. Intenta de nuevo en un minuto.'
  }
  return `Hubo un problema: ${err}`
}

async function send(text?: string) {
  const userText = (text ?? input.value).trim()
  if (!userText || isLoading.value) return

  input.value = ''
  interimText.value = ''
  micError.value = ''
  stopListening()
  stopSpeaking()

  messages.value.push({ id: msgId++, role: 'user', content: userText })
  history.value.push({ role: 'user', content: userText })
  scrollToBottom()

  isLoading.value = true
  toolStatus.value = 'Pensando...'

  try {
    const reply = await sendMessage(history.value, (label) => { toolStatus.value = label })
    const content = reply.text || (reply.actions.length ? 'Listo.' : 'No tengo respuesta para eso.')
    messages.value.push({ id: msgId++, role: 'assistant', content, actions: reply.actions })
    history.value.push({ role: 'assistant', content })
    isLoading.value = false
    speak(content)
  } catch (e) {
    const msg = friendlyError((e as Error).message)
    messages.value.push({ id: msgId++, role: 'assistant', content: msg })
    // Sin respuesta válida: se saca la pregunta del historial para no
    // dejar dos mensajes seguidos del usuario
    history.value.pop()
    isLoading.value = false
    speak(msg)
  } finally {
    isLoading.value = false
    toolStatus.value = ''
    scrollToBottom()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

function clearChat() {
  messages.value = []
  history.value  = []
  stopSpeaking()
}

// ─── Voice ────────────────────────────────────────────────────────────────────

const SpeechRecognition =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

let recognition: any = null
let silentTries = 0

function setupRecognition() {
  if (!SpeechRecognition) return
  recognition = new SpeechRecognition()
  recognition.lang = 'es-CO'
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onresult = (event: any) => {
    let interim = '', final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript
      if (event.results[i].isFinal) final += t
      else interim += t
    }
    interimText.value = interim
    if (final) input.value = (input.value + ' ' + final).trim()
  }

  recognition.onend = () => {
    isListening.value = false
    interimText.value = ''
    const pendingText = input.value.trim()
    recognition = null  // la instancia no puede reutilizarse; se crea una nueva al siguiente uso
    if (pendingText) {
      silentTries = 0
      send()
    }
  }

  recognition.onerror = (event: any) => {
    isListening.value = false
    interimText.value = ''
    recognition = null
    switch (event?.error) {
      case 'not-allowed':
      case 'service-not-allowed':
        micError.value = 'El navegador no deja usar el micrófono. Dale permiso en la configuración del sitio.'
        handsFree.value = false
        break
      case 'no-speech':
        // En manos libres se reintenta una vez; si sigue el silencio, se apaga
        silentTries++
        if (handsFree.value && silentTries < 2) {
          setTimeout(() => { if (handsFree.value && isOpen.value) startListening() }, 300)
        } else if (handsFree.value) {
          handsFree.value = false
          micError.value = 'No escuché nada, apagué manos libres. Toca el micrófono para hablar.'
        }
        break
      case 'network':
        micError.value = 'El reconocimiento de voz necesita internet.'
        break
      case 'aborted':
        break
      default:
        micError.value = 'No pude escucharte. Intenta de nuevo.'
    }
  }
}

function toggleMic() {
  if (isListening.value) {
    stopListening()
    handsFree.value = false
  } else {
    silentTries = 0
    startListening()
  }
}

function startListening() {
  if (isLoading.value) return
  stopSpeaking()  // que el micrófono no se escuche a sí mismo
  setupRecognition()  // siempre instancia nueva para evitar InvalidStateError
  if (!recognition) return
  input.value = ''
  interimText.value = ''
  micError.value = ''
  isListening.value = true
  try {
    recognition.start()
  } catch {
    isListening.value = false
    recognition = null
  }
}

function stopListening() {
  isListening.value = false
  interimText.value = ''
  if (recognition) {
    try { recognition.stop() } catch { /* ya detuvo */ }
  }
}

// ─── Open / close ─────────────────────────────────────────────────────────────

function open()  { isOpen.value = true;  scrollToBottom() }
function close() { isOpen.value = false; handsFree.value = false; stopListening(); stopSpeaking() }

onUnmounted(() => { stopListening(); stopSpeaking() })
</script>

<template>
  <!-- Backdrop (mobile) -->
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 bg-black/30 lg:hidden"
      @click="close"
    />
  </Transition>

  <!-- Panel expandido -->
  <Transition name="ai-panel">
    <div
      v-if="isOpen"
      class="fixed z-50 bg-white shadow-2xl border border-slate-200 flex flex-col
             inset-x-0 bottom-0 rounded-t-2xl
             lg:inset-auto lg:bottom-20 lg:right-4 lg:rounded-2xl lg:w-[600px]"
      style="height: min(82dvh, 800px); max-height: calc(100dvh - 20px)"
    >
      <!-- Header -->
      <div class="flex items-center gap-2 px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-t-2xl shrink-0">
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <Bot class="w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-tight">Asistente Finca</p>
          <p class="text-xs text-emerald-100 truncate">
            {{ handsFree ? 'Manos libres: habla cuando quieras' : 'Habla o escribe' }}
          </p>
        </div>
        <button
          v-if="SpeechRecognition"
          :title="handsFree ? 'Apagar manos libres' : 'Manos libres: conversa sin tocar la pantalla'"
          :class="['flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                   handsFree ? 'bg-white text-emerald-700' : 'hover:bg-white/20']"
          @click="toggleHandsFree"
        >
          <Headphones class="w-4 h-4" />
          <span class="hidden sm:inline">Manos libres</span>
        </button>
        <button
          :title="voiceEnabled ? 'Silenciar respuestas' : 'Leer respuestas en voz alta'"
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="toggleVoice"
        >
          <component :is="voiceEnabled ? Volume2 : VolumeX" class="w-4 h-4" />
        </button>
        <button
          title="Limpiar chat"
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="clearChat"
        >
          <Trash2 class="w-4 h-4" />
        </button>
        <button
          title="Cerrar"
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesEl" class="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">

        <!-- Empty state -->
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center gap-5 py-6">
          <div class="text-center">
            <div class="w-14 h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Bot class="w-7 h-7 text-emerald-600" />
            </div>
            <p class="font-semibold text-slate-700">¿En qué te puedo ayudar?</p>
            <p class="text-xs text-slate-400 mt-1 max-w-xs">
              Toca el micrófono y dicta: leche, partos, vacunas, gastos, ventas… o pregunta cualquier dato de la finca.
            </p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <button
              v-for="s in SUGGESTIONS"
              :key="s"
              class="text-xs text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-slate-600 border border-slate-200 transition-colors"
              @click="send(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- Mensajes -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-2.5'"
          >
            <div
              v-if="msg.role === 'assistant'"
              class="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5"
            >
              <Bot class="w-4 h-4 text-white" />
            </div>
            <div class="max-w-[82%] flex flex-col gap-1.5">
              <div
                :class="[
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm self-end'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                ]"
              >
                {{ msg.content }}
              </div>
              <!-- Qué quedó guardado: para notar si la voz entendió mal -->
              <div v-if="msg.actions?.length" class="flex flex-col gap-1">
                <div
                  v-for="(a, i) in msg.actions"
                  :key="i"
                  :class="[
                    'flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border',
                    a.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                  ]"
                >
                  <component :is="a.ok ? CheckCircle2 : AlertCircle" class="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{{ a.summary }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Thinking -->
          <div v-if="isLoading" class="flex justify-start gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <Bot class="w-4 h-4 text-white" />
            </div>
            <div class="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
              {{ toolStatus }}
            </div>
          </div>
        </template>
      </div>

      <!-- Input -->
      <div class="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
        <p v-if="micError" class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          {{ micError }}
        </p>
        <p v-if="isListening" class="text-sm text-slate-600 px-1 mb-2 min-h-[1.25rem]">
          <span class="text-red-500 font-medium">● Escuchando</span>
          <span v-if="interimText || input" class="italic text-slate-500"> — "{{ (input + ' ' + interimText).trim() }}"</span>
        </p>
        <button
          v-if="isSpeaking"
          class="w-full mb-2 flex items-center justify-center gap-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5 transition-colors"
          @click="stopSpeaking"
        >
          <Square class="w-3 h-3" /> Dejar de hablar
        </button>
        <div class="flex items-end gap-2">
          <button
            v-if="SpeechRecognition"
            :disabled="isLoading"
            :class="[
              'w-14 h-14 rounded-full flex items-center justify-center transition-all shrink-0 shadow-sm',
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'
            ]"
            :title="isListening ? 'Detener' : 'Hablar'"
            @click="toggleMic"
          >
            <component :is="isListening ? MicOff : Mic" class="w-6 h-6" />
          </button>

          <div class="flex-1 flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-all">
            <textarea
              v-model="input"
              rows="1"
              :disabled="isLoading"
              placeholder="Escribe o usa el micrófono..."
              class="flex-1 resize-none text-sm bg-transparent outline-none py-2 min-h-[38px] max-h-[120px] placeholder-slate-400 disabled:opacity-50"
              @keydown="onKeydown"
              @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
            />
            <button
              :disabled="!input.trim() || isLoading"
              class="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mb-0.5"
              title="Enviar"
              @click="send()"
            >
              <Send class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Botón flotante -->
  <button
    :class="[
      'fixed bottom-5 right-5 z-50 rounded-full shadow-xl transition-all duration-200 flex items-center justify-center',
      isOpen ? 'w-12 h-12 bg-slate-700 hidden lg:flex' : 'w-14 h-14 bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
    ]"
    :title="isOpen ? 'Cerrar asistente' : 'Abrir asistente IA'"
    @click="isOpen ? close() : open()"
  >
    <Transition name="icon-swap" mode="out-in">
      <X   v-if="isOpen"  key="x"   class="w-5 h-5 text-white" />
      <Bot v-else          key="bot" class="w-6 h-6 text-white" />
    </Transition>
  </button>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s }
.fade-enter-from, .fade-leave-to       { opacity: 0 }

.ai-panel-enter-active, .ai-panel-leave-active { transition: opacity 0.2s, transform 0.25s }
.ai-panel-enter-from, .ai-panel-leave-to       { opacity: 0; transform: translateY(16px) scale(0.97) }

.icon-swap-enter-active, .icon-swap-leave-active { transition: opacity 0.1s }
.icon-swap-enter-from, .icon-swap-leave-to       { opacity: 0 }
</style>
