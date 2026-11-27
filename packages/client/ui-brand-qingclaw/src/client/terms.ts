/** Deployment wording that overrides copy owned by other packages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'

/** Keys the QingClaw distribution replaces, by namespace. */
export interface TermOverrides {
  /** Locale tag to the keys this distribution replaces, per namespace. */
  readonly [namespace: string]: Readonly<Record<string, Readonly<Record<string, string>>>>
}

/** Wording this distribution owns instead of the package that declares the namespace. */
export const TERMS: TermOverrides = {
  chat: {
    zh: {
      'chat.deepDiving': '思考中',
      'chat.deepDivingFor': '思考中，用时 {duration} ···',
    },
    en: {
      'chat.deepDiving': 'Thinking',
      'chat.deepDivingFor': 'Thinking for {duration} ···',
    },
  },
  'settings.account': {
    zh: {
      nav: '青狮账号',
      signedIn: '已登录青狮',
      backToHarness: '返回青狮',
      loginDescription: '登录青狮账号即可开始使用。你的项目和文件保存在本地。',
      signInDescription: '使用青狮账号开始使用。',
      settingsSignedOutTitle: '你尚未登录青狮',
      settingsSignedOutDescription: '登录青狮账号后即可继续使用内置模型与额度。',
      quotaDescription: '额度不足时无法开始新任务。充值后可继续，也可以稍后在「设置 → 青狮账号」里充值。',
    },
    en: {
      nav: 'QingClaw account',
      signedIn: 'Signed in to QingClaw',
      backToHarness: 'Back to QingClaw',
      loginDescription: 'Sign in with your QingClaw account to get started. Your projects and files are stored locally.',
      signInDescription: 'Use your QingClaw account to get started.',
      settingsSignedOutTitle: 'You are not signed in to QingClaw',
      settingsSignedOutDescription: 'Sign in to QingClaw to keep using the built-in models and credits.',
      quotaDescription: 'QingClaw cannot start a new task without credits. Top up to continue, or later in Settings → QingClaw account.',
    },
  },
  'entryCustomization': {
    "de": {
      "createPrompt.sidebar": "Erstellen Sie ein QingClaw-Plugin mit einem Eintrag in der linken Seitenleiste.",
      "createPrompt.conversation": "Erstellen Sie ein QingClaw-Plugin für die Konversationsansicht.",
      "createPrompt.rightbar": "Erstellen Sie ein QingClaw-Plugin mit einem Eintrag in der rechten Seitenleiste.",
    },
    "en": {
      "createPrompt.sidebar": "Create a QingClaw plugin with a left sidebar entry.",
      "createPrompt.conversation": "Create a QingClaw conversation view plugin.",
      "createPrompt.rightbar": "Create a QingClaw plugin with a right sidebar entry.",
    },
    "es": {
      "createPrompt.sidebar": "Cree un complemento QingClaw con una entrada en la barra lateral izquierda.",
      "createPrompt.conversation": "Cree un complemento de vista de conversación QingClaw.",
      "createPrompt.rightbar": "Cree un complemento QingClaw con una entrada en la barra lateral derecha.",
    },
    "fr": {
      "createPrompt.sidebar": "Créez un plugin QingClaw avec une entrée dans la barre latérale gauche.",
      "createPrompt.conversation": "Créez un plugin d'affichage de conversation QingClaw.",
      "createPrompt.rightbar": "Créez un plugin QingClaw avec une entrée dans la barre latérale droite.",
    },
    "ja": {
      "createPrompt.sidebar": "左サイドバーにエントリを持つ QingClaw プラグインを作成します。",
      "createPrompt.conversation": "QingClaw 会話ビュープラグインを作成します。",
      "createPrompt.rightbar": "右サイドバーにエントリを持つ QingClaw プラグインを作成します。",
    },
    "pt": {
      "createPrompt.sidebar": "Crie um plug-in QingClaw com uma entrada na barra lateral esquerda.",
      "createPrompt.conversation": "Crie um plug-in de visualização de conversa QingClaw.",
      "createPrompt.rightbar": "Crie um plug-in QingClaw com uma entrada na barra lateral direita.",
    },
    "ru": {
      "createPrompt.sidebar": "Создайте плагин QingClaw с записью на левой боковой панели.",
      "createPrompt.conversation": "Создайте плагин просмотра диалога QingClaw.",
      "createPrompt.rightbar": "Создайте плагин QingClaw с записью на правой боковой панели.",
    },
    "zh": {
      "createPrompt.sidebar": "创建一个带左侧栏入口的青狮龙虾插件。",
      "createPrompt.conversation": "创建一个青狮龙虾会话视图插件。",
      "createPrompt.rightbar": "创建一个带右侧栏入口的青狮龙虾插件。",
    },
  },
  'settings.models': {
    "de": {
      "deepSeekAccount": "QingClaw-Konto",
    },
    "en": {
      "deepSeekAccount": "QingClaw Account",
    },
    "es": {
      "deepSeekAccount": "Cuenta QingClaw",
    },
    "fr": {
      "deepSeekAccount": "Compte QingClaw",
    },
    "ja": {
      "deepSeekAccount": "QingClaw アカウント",
    },
    "pt": {
      "deepSeekAccount": "Conta QingClaw",
    },
    "ru": {
      "deepSeekAccount": "Аккаунт QingClaw",
    },
    "zh": {
      "deepSeekAccount": "青狮账号",
    },
  },
  'settings.webSearch': {
    "en": {
      "billingAutoHint": "Follows the conversation's QingClaw account or DeepSeek API key; with other models, uses the API key first, then the signed-in account.",
      "billingAccount": "Signed-in QingClaw account",
      "billingAccountHint": "Requires signing in to QingClaw.",
    },
    "zh": {
      "billingAutoHint": "跟随当前会话的青狮账号或 DeepSeek API Key；会话用其他模型时，优先用 API Key，没有则用已登录账号。",
      "billingAccount": "已登录的青狮账号",
      "billingAccountHint": "需要先登录青狮账号。",
    },
  },
  conversation: {
    "de": {
      "hero.headline": "KI-Assistent für Anwälte",
      "error.sessionInUse": "Diese Sitzung wird bereits verwendet, möglicherweise von einer anderen laufenden QingClaw-Instanz (z. B. dsh Web oder der Desktop-App). Beenden Sie andere laufende QingClaw-Instanzen und versuchen Sie es erneut.",
    },
    "en": {
      "hero.headline": "AI assistant for lawyers",
      "error.sessionInUse": "This session is already in use, possibly by another running QingClaw instance (such as qingclaw web or the desktop app). Quit other running QingClaw instances and try again.",
    },
    "es": {
      "hero.headline": "Asistente de IA para abogados",
      "error.sessionInUse": "Esta sesión ya está en uso, posiblemente por otra instancia de QingClaw en ejecución (como la web dsh o la aplicación de escritorio). Salga de otras instancias de QingClaw en ejecución y vuelva a intentarlo.",
    },
    "fr": {
      "hero.headline": "Assistant IA pour avocats",
      "error.sessionInUse": "Cette session est déjà utilisée, éventuellement par une autre instance QingClaw en cours d'exécution (telle que le Web dsh ou l'application de bureau). Quittez les autres instances QingClaw en cours d'exécution et réessayez.",
    },
    "ja": {
      "hero.headline": "弁護士向け AI アシスタント",
      "error.sessionInUse": "このセッションはすでに使用中です。別の実行中のQingClawインスタンス（qingclaw webやデスクトップアプリなど）が使用している可能性があります。他のQingClawインスタンスを終了して再試行してください。",
    },
    "pt": {
      "hero.headline": "Assistente de IA para advogados",
      "error.sessionInUse": "Esta sessão já está em uso, possivelmente por outra instância QingClaw em execução (como qingclaw web ou aplicativo de desktop). Saia de outras instâncias QingClaw em execução e tente novamente.",
    },
    "ru": {
      "hero.headline": "ИИ-ассистент для юристов",
      "error.sessionInUse": "Этот сеанс уже используется, возможно, другим работающим экземпляром QingClaw (например, веб-сайтом dsh или настольным приложением). Закройте другие работающие экземпляры QingClaw и повторите попытку.",
    },
    "zh": {
      "hero.headline": "律师 AI 助理",
      "error.sessionInUse": "当前会话已被占用，可能是其他正在运行的青狮龙虾导致的（如其他 qingclaw web、桌面端），请退出其他正在运行的青狮龙虾后重试。",
    },
  },
  'settings.agentPreset': {
    "de": {
      "sectionIntro": "Wählen Sie die Tools des Agenten und deren Funktionsweise aus. Verwenden Sie den Standardmodus für alltägliche Aufgaben oder den Creator-Modus, um QingClaw Funktionen hinzuzufügen.",
      "createPluginDescription": "Wechseln Sie in den Erstellermodus und erstellen Sie Ihr eigenes QingClaw-Plugin",
    },
    "en": {
      "sectionIntro": "Choose the agent’s tools and how it works. Use Standard mode for everyday tasks, or Creator mode to add capabilities to QingClaw.",
      "createPluginDescription": "Enter Creator mode and make your own QingClaw plugin",
    },
    "es": {
      "sectionIntro": "Elija las herramientas del agente y cómo funciona. Utilice el modo Estándar para las tareas diarias o el modo Creador para agregar capacidades a QingClaw.",
      "createPluginDescription": "Ingrese al modo Creador y cree su propio complemento QingClaw",
    },
    "fr": {
      "sectionIntro": "Choisissez les outils de l’agent et son fonctionnement. Utilisez le mode Standard pour les tâches quotidiennes ou le mode Créateur pour ajouter des fonctionnalités à QingClaw.",
      "createPluginDescription": "Entrez en mode Créateur et créez votre propre plugin QingClaw",
    },
    "ja": {
      "sectionIntro": "エージェントのツールと動作を選択します。日々のタスクには標準モードを、QingClaw に機能を追加するにはクリエイターモードを使用してください。",
      "presetCordisDescription": "会話を通じて QingClaw をカスタマイズします。機能や UI を追加するプラグインをエージェントに書かせたり、ツールとプロンプトを組み合わせて独自のモードを作成したりできます。",
      "createPluginDescription": "クリエイターモードに入り、独自の QingClaw プラグインを作成",
    },
    "pt": {
      "sectionIntro": "Escolha as ferramentas do agente e como funciona. Use o modo Padrão para tarefas diárias ou o modo Criador para adicionar recursos ao QingClaw.",
      "createPluginDescription": "Entre no modo Criador e crie seu próprio plug-in QingClaw",
    },
    "ru": {
      "sectionIntro": "Выбирайте инструменты агента и то, как они работают. Используйте стандартный режим для повседневных задач или режим Creator, чтобы расширить возможности QingClaw.",
      "createPluginDescription": "Войдите в режим Creator и создайте свой собственный плагин QingClaw.",
    },
    "zh": {
      "sectionIntro": "选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展青狮龙虾的能力用「创造模式」。",
      "presetCordisDescription": "用对话定制青狮龙虾：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。",
      "createPluginDescription": "进入创造模式，制作属于你的青狮龙虾插件",
    },
  },
}

/**
 * Register every deployment term as an override on its owning namespace.
 * @param ctx - client plugin context that owns the locale service.
 */
export function applyTerms(ctx: Context): void {
  for (const [namespace, dicts] of Object.entries(TERMS)) {
    ctx.effect(() => ctx.locale.override(namespace, dicts), `client-ui-brand-qingclaw: ${namespace} terms`)
  }
}
