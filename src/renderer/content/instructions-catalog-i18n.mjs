import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '../../common/i18n/locale-config.mjs'
import { INSTRUCTIONS_CATALOG } from './instructions-catalog.mjs'

const GUIDE_BLOCK_BASE = Object.freeze({
  sectionTitle: 'Usage Guide',
  sectionDescription: 'Review the current ADDOM workflow, panel layout, safety behavior, editor tools, and data controls.',
  guideLabel: 'In-App Guide',
  versionLabel: 'Version {{version}}',
  updatedLabel: 'Updated {{date}}',
  openGuide: 'Open Guide',
  note: 'Use this guide as the single reference for workspace setup, chat execution, terminal sessions, editor and artifact flows, memory behavior, providers, and reset or export actions.',
})

const CATALOG_COPY_BASE = Object.freeze({
  title: INSTRUCTIONS_CATALOG.title,
  updatedLabel: 'Last updated {{date}}',
  description: INSTRUCTIONS_CATALOG.description,
  sections: Object.freeze({}),
})

const LOCALIZED_GUIDE_COPY = Object.freeze({
  de: Object.freeze({
    title: 'ADDOM verwenden',
    updatedLabel: 'Zuletzt aktualisiert {{date}}',
    description: 'Aktuelle Anleitung zum realen ADDOM-Workflow: Workspace-Einrichtung, Ausführung im Chat, Editor-Werkzeuge, Memory, Provider-Einrichtung und Datenkontrollen.',
    guideBlock: {
      sectionTitle: 'Nutzungsanleitung',
      sectionDescription: 'Prüfen Sie den aktuellen ADDOM-Workflow, die Panel-Struktur, das Sicherheitsverhalten, die Editor-Werkzeuge und die Datenkontrollen.',
      guideLabel: 'In-App-Anleitung',
      versionLabel: 'Version {{version}}',
      updatedLabel: 'Aktualisiert {{date}}',
      openGuide: 'Anleitung öffnen',
      note: 'Verwenden Sie diese Anleitung als zentrale Referenz für Workspace-Einrichtung, Chat-Ausführung, Terminal-Sitzungen, Editor- und Artifact-Abläufe, Memory-Verhalten, Provider sowie Export- oder Reset-Aktionen.',
    },
    sections: {
      'workspace-basics': {
        title: 'Workspace-Grundlagen',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Verwenden Sie in Chat die Schaltfläche Threads, um den Thread-Drawer zu öffnen. Threads lassen sich suchen, erstellen, umbenennen und löschen und zeigen Zustände wie aktiv, ausstehende Freigabe oder blockiert.',
          'Mit Cmd/Ctrl+Shift+P öffnen Sie die command palette. Damit können Sie Panels öffnen, Threads verwalten, das Terminal öffnen und Editor-Aktionen ausführen.',
        ],
      },
      'chat-composer': {
        title: 'Chat und Composer',
        items: [
          'Wählen Sie vor dem Senden im Composer-Rail einen Provider und ein Modell. Wenn ein zuvor gewähltes Modell verschwindet, aktualisieren Sie die Provider-Daten und wählen Sie ein neues Modell.',
          'Execute ist der normale Modus mit Werkzeugen. Plan ist werkzeugfrei und dient der Planung. Thinking ist nur für Brainstorming und führt keine Werkzeuge aus.',
          'Der Composer unterstützt Text-, Bild- und Dateianhänge, wenn das gewählte Modell sie zulässt. Einige Anhänge können auch zur OpenAI Knowledge Base des Projekts hinzugefügt werden.',
          'Der Chat-Header hält den aktuellen Thread, den permission mode, die Terminal-Aktivität und die Git-Zusammenfassung während der Arbeit sichtbar.',
        ],
      },
      'execution-and-terminal': {
        title: 'Ausführung, Freigaben und Terminal',
        items: [
          'Der permission mode steuert, wie Werkzeugaufrufe freigegeben werden: Ask, Autonomy oder Full Access. Die harte Sicherheitsrichtlinie kann unsichere Aktionen trotzdem blockieren.',
          'Live execution und turn runbooks zeigen Fortschritt, Freigaben, Werkzeugaktivität, Dateiveränderungen und Konflikte direkt in der Timeline.',
          'Laufende lokale Befehle und abgetrennte OpenAI-Hintergrundantworten erscheinen in Background Jobs und können dort aktualisiert oder gestoppt werden.',
          'Das Terminal-Dock befindet sich unter dem Composer. Es kann laufende Sitzungen, ausstehende Freigaben und archivierte Terminal-Historie durchsuchen und erlaubt bei Bedarf die Übernahme der Shell-Steuerung vom Modell.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes und Artifacts',
        items: [
          'Der Editor bietet Dateibaum, mehrere Tabs, Dirty-Tracking, Speichern per Tastenkürzel, Markdown-Vorschau, Problems- und Outline-Panels, Inline Completion sowie optionale Format- oder Fix-Aktionen für die aktive Datei.',
          'AI on Selection sendet die aktuelle Auswahl als Kontext für Explain, Fix, Refactor oder Test-Generierung in den Chat.',
          'Changes zeigt Branch-Status, gestagte und ungestagte Dateien, Filter, durchsuchbare Listen, SCM-Details, Restore- und Unstage-Aktionen sowie Commits nur aus gestagten Dateien.',
          'Artifacts speichert den Verlauf von AI-Schreibvorgängen und gestagten Vorschlägen. Sie können Revisionen vergleichen, Vorschläge auf den Datenträger anwenden, auf ältere Revisionen zurückrollen, die Datei im Editor öffnen oder den Artifact-Verlauf löschen, ohne die Datei selbst zu löschen.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory und Continuity',
        items: [
          'Memory-Knoten können im aktuellen Thread, im Projekt oder global liegen. Sie können suchen, anheften, bearbeiten, löschen, hochstufen, global machen oder im aktuellen Thread behalten.',
          'Das Memory-Panel besitzt außerdem eine Thread-History-Ansicht und kann Kontext-JSON exportieren, das Memory- und Artifact-Daten enthält.',
          'Die automatische Memory-Komprimierung kann älteres Material archivieren. Archivierte Einträge bleiben sichtbar, wenn Show archived aktiviert ist.',
          'Kontext- und Continuity-Anzeigen im Chat helfen zu erklären, wie viel Zustand zwischen Turns übernommen wird.',
        ],
      },
      'providers-and-moa': {
        title: 'Provider, Knowledge Base und MoA',
        items: [
          'Die Provider-Einstellungen unterstützen gespeicherte API Keys und bei OpenAI je nach Konfiguration entweder API-Key-Zugriff oder konto-basierten Zugriff.',
          'Mit der OpenRouter catalog visibility können laute Namespaces ausgeblendet werden, ohne die explizite Routenauswahl zu verlieren.',
          'Die OpenAI Knowledge Base ist projektbezogen. Dorthin hochgeladene Dateien sind getrennt von normalen Chat-Anhängen und werden für gehostete file_search-Abrufe verwendet.',
          'Der OpenAI-Konto-Modus unterstützt derzeit keine gehosteten Projekt-Assets in der Knowledge Base. Verwenden Sie dafür den OpenAI-API-Key-Modus.',
          'MoA ist optional. Wenn es aktiviert ist, kommen Agent-Konfigurationen in Settings, ein Seitenpanel in Chat und Direct-Agent-Quick-Actions im Execute-Modus hinzu.',
        ],
      },
      'settings-and-data': {
        title: 'Settings und Datenkontrollen',
        items: [
          'Settings umfasst jetzt Sprache, Projektordner, Assistant Prompt Appendix, UI Scaling, Updates, Provider-Einrichtung, Tools & Safety, Memory & Continuity, MoA und Data & Privacy.',
          'Data & Privacy kann den aktuellen Thread exportieren, Thread-JSON importieren, Thread- oder Projekt-Historie löschen, gespeicherte API Keys entfernen, Provider-Budget- oder Spillover-Daten bereinigen oder alle lokalen ADDOM-Daten vollständig zurücksetzen.',
          'Einige Einstellungen wirken sofort, während bestimmte Shell-nahe Änderungen weiterhin einen Neustart der App erfordern können.',
        ],
      },
    },
  }),
  es: Object.freeze({
    title: 'Usar ADDOM',
    updatedLabel: 'Última actualización {{date}}',
    description: 'Guía actual del flujo real de ADDOM: configuración del workspace, ejecución en Chat, herramientas del Editor, Memory, providers y controles de datos.',
    guideBlock: {
      sectionTitle: 'Guía de uso',
      sectionDescription: 'Revisa el flujo actual de ADDOM, la estructura de paneles, el comportamiento de seguridad, las herramientas del Editor y los controles de datos.',
      guideLabel: 'Guía integrada',
      versionLabel: 'Versión {{version}}',
      updatedLabel: 'Actualizada {{date}}',
      openGuide: 'Abrir guía',
      note: 'Usa esta guía como referencia única para la configuración del workspace, la ejecución en Chat, las sesiones de terminal, los flujos del Editor y Artifacts, el comportamiento de Memory, los providers y las acciones de exportación o reinicio.',
    },
    sections: {
      'workspace-basics': {
        title: 'Fundamentos del Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Usa el botón Threads en Chat para abrir el thread drawer. Los threads se pueden buscar, crear, renombrar y eliminar, y muestran estados como activo, aprobación pendiente o bloqueado.',
          'Cmd/Ctrl+Shift+P abre la command palette. Desde ahí puedes navegar por panels, gestionar threads, abrir el terminal y lanzar acciones del Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat y Composer',
        items: [
          'Elige un provider y un modelo en el composer rail antes de enviar. Si un modelo seleccionado deja de estar disponible, actualiza los datos del provider y elige otro.',
          'Execute es el modo normal con tools. Plan es planificación sin tools. Thinking es solo para brainstorming y no ejecuta tools.',
          'El Composer admite texto, imágenes y archivos adjuntos cuando el modelo seleccionado lo permite. Algunos adjuntos también pueden añadirse a la OpenAI Knowledge Base del proyecto.',
          'El encabezado de Chat mantiene visibles el thread actual, el permission mode, la actividad del terminal y el resumen de git mientras trabajas.',
        ],
      },
      'execution-and-terminal': {
        title: 'Ejecución, aprobaciones y terminal',
        items: [
          'El permission mode controla cómo se aprueban las llamadas a tools: Ask, Autonomy o Full Access. La política dura de seguridad puede seguir bloqueando acciones inseguras.',
          'Live execution y los turn runbooks muestran el progreso, las aprobaciones, la actividad de tools, los cambios de archivos y los conflictos directamente en la timeline.',
          'Los comandos locales de larga duración y las respuestas de fondo de OpenAI separadas aparecen en Background Jobs, donde se pueden refrescar o detener.',
          'El terminal dock vive debajo del Composer. Puede explorar sesiones activas, aprobaciones pendientes e historial archivado del terminal, y permite tomar el control de la shell cuando sea necesario.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes y Artifacts',
        items: [
          'El Editor incluye árbol de archivos, varias pestañas, seguimiento de cambios sin guardar, guardado por atajo, vista previa Markdown, panels de Problems y Outline, inline completion y acciones opcionales de format o fix para el archivo activo.',
          'AI on Selection envía la selección actual al Chat como contexto para Explain, Fix, Refactor o generación de tests.',
          'Changes muestra el estado de la rama, archivos staged y unstaged, filtros, listas buscables, detalle SCM, acciones de restore y unstage, y commits solo a partir de archivos staged.',
          'Artifacts guarda el historial de escrituras de AI y sugerencias staged. Puedes comparar revisiones, aplicar sugerencias a disco, volver a una revisión anterior, abrir el archivo en el Editor o borrar el historial de Artifacts sin borrar el archivo.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory y Continuity',
        items: [
          'Los nodos de Memory pueden vivir en el thread actual, en el proyecto o a nivel global. Puedes buscarlos, fijarlos, editarlos, borrarlos, promoverlos, hacerlos globales o mantenerlos en el thread actual.',
          'El panel Memory también incluye una vista de historial del thread y puede exportar un JSON de contexto con datos de Memory y Artifacts.',
          'La compresión automática de Memory puede archivar material antiguo. Las entradas archivadas siguen disponibles si activas Show archived.',
          'Los indicadores de contexto y Continuity en Chat ayudan a explicar cuánto estado anterior se arrastra entre turnos.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base y MoA',
        items: [
          'Los ajustes de providers admiten API Keys guardadas y, en OpenAI, acceso por API key o por cuenta según cómo esté configurado el provider.',
          'La visibilidad del catálogo de OpenRouter puede ocultar namespaces ruidosos sin perder la selección explícita de rutas.',
          'La OpenAI Knowledge Base tiene alcance de proyecto. Los archivos subidos allí están separados de los adjuntos normales de Chat y se usan para retrieval con file_search alojado.',
          'El modo de cuenta de OpenAI no admite todavía assets alojados de Knowledge Base del proyecto. Para ese panel usa el modo OpenAI API key.',
          'MoA es opcional. Al activarlo se añaden la configuración de agents en Settings, un panel lateral en Chat y acciones rápidas de agents directos en Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings y controles de datos',
        items: [
          'Settings ahora cubre idioma, carpeta del proyecto, Assistant Prompt Appendix, UI Scaling, updates, configuración de providers, Tools & Safety, Memory & Continuity, MoA y Data & Privacy.',
          'Data & Privacy puede exportar el thread actual, importar JSON de threads, borrar el historial del thread o del proyecto, eliminar API Keys guardadas, limpiar datos de presupuestos de provider o spillover, o restablecer por completo los datos locales de ADDOM.',
          'Algunos ajustes se aplican al momento, mientras que ciertos cambios a nivel de shell todavía pueden requerir reiniciar la app.',
        ],
      },
    },
  }),
  'pt-BR': Object.freeze({
    title: 'Usar o ADDOM',
    updatedLabel: 'Última atualização {{date}}',
    description: 'Guia atual do fluxo real do ADDOM: configuração do workspace, execução no Chat, ferramentas do Editor, Memory, providers e controles de dados.',
    guideBlock: {
      sectionTitle: 'Guia de uso',
      sectionDescription: 'Revise o fluxo atual do ADDOM, a estrutura dos painéis, o comportamento de segurança, as ferramentas do Editor e os controles de dados.',
      guideLabel: 'Guia no app',
      versionLabel: 'Versão {{version}}',
      updatedLabel: 'Atualizado {{date}}',
      openGuide: 'Abrir guia',
      note: 'Use este guia como referência única para configuração do workspace, execução no Chat, sessões de terminal, fluxos do Editor e Artifacts, comportamento de Memory, providers e ações de exportação ou reset.',
    },
    sections: {
      'workspace-basics': {
        title: 'Fundamentos do Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Use o botão Threads no Chat para abrir o thread drawer. Os threads podem ser pesquisados, criados, renomeados e excluídos, e mostram estados como ativo, aprovação pendente ou bloqueado.',
          'Cmd/Ctrl+Shift+P abre a command palette. Ela permite navegar entre painéis, gerenciar threads, abrir o terminal e disparar ações do Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat e Composer',
        items: [
          'Escolha um provider e um modelo no composer rail antes de enviar. Se um modelo selecionado desaparecer, atualize os dados do provider e escolha outro.',
          'Execute é o modo normal com tools. Plan é planejamento sem tools. Thinking serve apenas para brainstorming e não executa tools.',
          'O Composer aceita texto, imagens e arquivos anexados quando o modelo selecionado permite. Alguns anexos também podem ser adicionados à OpenAI Knowledge Base do projeto.',
          'O cabeçalho do Chat mantém visíveis o thread atual, o permission mode, a atividade do terminal e o resumo do git enquanto você trabalha.',
        ],
      },
      'execution-and-terminal': {
        title: 'Execução, aprovações e terminal',
        items: [
          'O permission mode controla como as chamadas de tools são aprovadas: Ask, Autonomy ou Full Access. A política dura de segurança ainda pode bloquear ações inseguras.',
          'Live execution e turn runbooks mostram progresso, aprovações, atividade de tools, mudanças de arquivos e conflitos diretamente na timeline.',
          'Comandos locais de longa duração e respostas destacadas de OpenAI aparecem em Background Jobs, onde podem ser atualizados ou interrompidos.',
          'O terminal dock fica abaixo do Composer. Ele pode navegar por sessões ativas, aprovações pendentes e histórico arquivado do terminal, e permite assumir o controle do shell quando necessário.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes e Artifacts',
        items: [
          'O Editor inclui árvore de arquivos, múltiplas abas, controle de alterações não salvas, atalhos de salvamento, preview de Markdown, painéis de Problems e Outline, inline completion e ações opcionais de format ou fix para o arquivo ativo.',
          'AI on Selection envia a seleção atual para o Chat como contexto de Explain, Fix, Refactor ou geração de testes.',
          'Changes mostra o estado da branch, arquivos staged e unstaged, filtros, listas pesquisáveis, detalhes de SCM, ações de restore e unstage, e commits apenas a partir de arquivos staged.',
          'Artifacts guarda o histórico de escritas da AI e sugestões staged. Você pode comparar revisões, aplicar sugestões ao disco, voltar para uma revisão anterior, abrir o arquivo no Editor ou apagar o histórico de Artifacts sem apagar o arquivo.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory e Continuity',
        items: [
          'Nós de Memory podem viver no thread atual, no projeto ou no escopo global. Você pode pesquisar, fixar, editar, excluir, promover, tornar global ou manter nós no thread atual.',
          'O painel Memory também inclui uma visualização do histórico do thread e pode exportar JSON de contexto com dados de Memory e Artifacts.',
          'A compressão automática de Memory pode arquivar material antigo. Entradas arquivadas continuam disponíveis quando Show archived está ativado.',
          'Indicadores de contexto e Continuity no Chat ajudam a explicar quanto estado anterior está sendo carregado entre os turns.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base e MoA',
        items: [
          'As configurações de providers aceitam API Keys salvas e, no caso de OpenAI, acesso por API key ou por conta, dependendo de como o provider está configurado.',
          'A visibilidade do catálogo do OpenRouter pode ocultar namespaces barulhentos sem perder a seleção explícita de rotas.',
          'A OpenAI Knowledge Base é vinculada ao projeto. Os arquivos enviados para lá ficam separados dos anexos normais do Chat e são usados para retrieval com file_search hospedado.',
          'O modo de conta da OpenAI ainda não oferece suporte a assets hospedados da Knowledge Base do projeto. Para esse painel, use o modo OpenAI API key.',
          'MoA é opcional. Quando ativado, ele adiciona configuração de agents em Settings, um painel lateral no Chat e ações rápidas de agents diretos no modo Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings e controles de dados',
        items: [
          'Settings agora cobre idioma, pasta do projeto, Assistant Prompt Appendix, UI Scaling, updates, configuração de providers, Tools & Safety, Memory & Continuity, MoA e Data & Privacy.',
          'Data & Privacy pode exportar o thread atual, importar JSON de thread, limpar histórico do thread ou do projeto, excluir API Keys salvas, limpar dados de orçamento de provider ou spillover, ou redefinir completamente os dados locais do ADDOM.',
          'Algumas configurações se aplicam imediatamente, enquanto certas mudanças no nível do shell ainda podem exigir reiniciar o app.',
        ],
      },
    },
  }),
  fr: Object.freeze({
    title: 'Utiliser ADDOM',
    updatedLabel: 'Dernière mise à jour {{date}}',
    description: 'Guide actuel du flux de travail réel d’ADDOM : configuration du workspace, exécution dans Chat, outils de l’Editor, Memory, providers et contrôles de données.',
    guideBlock: {
      sectionTitle: 'Guide d’utilisation',
      sectionDescription: 'Consultez le flux de travail actuel d’ADDOM, la structure des panneaux, le comportement de sécurité, les outils de l’Editor et les contrôles de données.',
      guideLabel: 'Guide intégré',
      versionLabel: 'Version {{version}}',
      updatedLabel: 'Mis à jour {{date}}',
      openGuide: 'Ouvrir le guide',
      note: 'Utilisez ce guide comme référence unique pour la configuration du workspace, l’exécution dans Chat, les sessions terminal, les flux Editor et Artifacts, le comportement de Memory, les providers et les actions d’export ou de réinitialisation.',
    },
    sections: {
      'workspace-basics': {
        title: 'Bases du Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Utilisez le bouton Threads dans Chat pour ouvrir le thread drawer. Les threads peuvent être recherchés, créés, renommés et supprimés, et affichent des états comme actif, approbation en attente ou bloqué.',
          'Cmd/Ctrl+Shift+P ouvre la command palette. Elle permet de naviguer entre les panneaux, gérer les threads, ouvrir le terminal et déclencher des actions de l’Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat et Composer',
        items: [
          'Choisissez un provider et un modèle dans le composer rail avant d’envoyer. Si un modèle précédemment choisi disparaît, actualisez les données du provider et choisissez-en un autre.',
          'Execute est le mode normal avec tools. Plan sert à planifier sans tools. Thinking sert uniquement au brainstorming et n’exécute pas de tools.',
          'Le Composer prend en charge le texte, les images et les pièces jointes quand le modèle sélectionné le permet. Certaines pièces jointes peuvent aussi être ajoutées à la OpenAI Knowledge Base du projet.',
          'L’en-tête de Chat garde visibles le thread courant, le permission mode, l’activité du terminal et le résumé git pendant le travail.',
        ],
      },
      'execution-and-terminal': {
        title: 'Exécution, approbations et terminal',
        items: [
          'Le permission mode contrôle la validation des appels de tools : Ask, Autonomy ou Full Access. La politique de sécurité stricte peut toujours bloquer des actions dangereuses.',
          'Live execution et les turn runbooks affichent directement dans la timeline la progression, les approbations, l’activité des tools, les changements de fichiers et les conflits.',
          'Les commandes locales longues et les réponses OpenAI détachées apparaissent dans Background Jobs, où elles peuvent être actualisées ou arrêtées.',
          'Le terminal dock se trouve sous le Composer. Il permet de parcourir les sessions actives, les approbations en attente et l’historique terminal archivé, et de reprendre le contrôle du shell au modèle si nécessaire.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes et Artifacts',
        items: [
          'L’Editor comprend un arbre de fichiers, des onglets multiples, le suivi des modifications non enregistrées, des raccourcis de sauvegarde, un aperçu Markdown, les panneaux Problems et Outline, l’inline completion et des actions optionnelles de format ou fix pour le fichier actif.',
          'AI on Selection envoie la sélection actuelle dans Chat comme contexte pour Explain, Fix, Refactor ou la génération de tests.',
          'Changes affiche l’état de la branche, les fichiers staged et unstaged, les filtres, les listes recherchables, les détails SCM, les actions restore et unstage, et les commits à partir des seuls fichiers staged.',
          'Artifacts conserve l’historique des écritures AI et des suggestions staged. Vous pouvez comparer des révisions, appliquer des suggestions au disque, revenir à une révision plus ancienne, ouvrir le fichier dans l’Editor ou supprimer l’historique Artifacts sans supprimer le fichier lui-même.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory et Continuity',
        items: [
          'Les nœuds Memory peuvent vivre dans le thread actuel, au niveau projet ou au niveau global. Vous pouvez les rechercher, épingler, modifier, supprimer, promouvoir, rendre globaux ou conserver dans le thread actuel.',
          'Le panneau Memory inclut aussi une vue d’historique du thread et peut exporter un JSON de contexte contenant des données Memory et Artifacts.',
          'La compression automatique de Memory peut archiver le contenu ancien. Les entrées archivées restent consultables lorsque Show archived est activé.',
          'Les indicateurs de contexte et de Continuity dans Chat aident à comprendre quelle part de l’état précédent est réinjectée entre les turns.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base et MoA',
        items: [
          'Les paramètres des providers prennent en charge les API Keys enregistrées et, pour OpenAI, un accès par API key ou par compte selon la configuration du provider.',
          'La visibilité du catalogue OpenRouter peut masquer des namespaces bruyants sans retirer la sélection explicite de route.',
          'La OpenAI Knowledge Base est liée au projet. Les fichiers envoyés là sont séparés des pièces jointes normales de Chat et servent au retrieval hébergé avec file_search.',
          'Le mode compte OpenAI ne prend pas encore en charge les assets de Knowledge Base hébergés au niveau projet. Utilisez le mode OpenAI API key pour ce panneau.',
          'MoA est optionnel. Lorsqu’il est activé, il ajoute la configuration des agents dans Settings, un panneau latéral dans Chat et des actions rapides d’agents directs en mode Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings et contrôles de données',
        items: [
          'Settings couvre désormais la langue, le dossier projet, l’Assistant Prompt Appendix, UI Scaling, les updates, la configuration des providers, Tools & Safety, Memory & Continuity, MoA et Data & Privacy.',
          'Data & Privacy peut exporter le thread courant, importer un JSON de thread, effacer l’historique du thread ou du projet, supprimer les API Keys enregistrées, nettoyer les données de budget provider ou de spillover, ou réinitialiser complètement les données locales d’ADDOM.',
          'Certains réglages s’appliquent immédiatement, tandis que certains changements au niveau shell peuvent encore nécessiter un redémarrage de l’app.',
        ],
      },
    },
  }),
  it: Object.freeze({
    title: 'Usare ADDOM',
    updatedLabel: 'Ultimo aggiornamento {{date}}',
    description: 'Guida aggiornata al flusso reale di ADDOM: configurazione del workspace, esecuzione in Chat, strumenti dell’Editor, Memory, providers e controlli dei dati.',
    guideBlock: {
      sectionTitle: 'Guida all’uso',
      sectionDescription: 'Rivedi il flusso attuale di ADDOM, la struttura dei pannelli, il comportamento di sicurezza, gli strumenti dell’Editor e i controlli dei dati.',
      guideLabel: 'Guida integrata',
      versionLabel: 'Versione {{version}}',
      updatedLabel: 'Aggiornata {{date}}',
      openGuide: 'Apri guida',
      note: 'Usa questa guida come riferimento unico per la configurazione del workspace, l’esecuzione in Chat, le sessioni terminal, i flussi di Editor e Artifacts, il comportamento di Memory, i providers e le azioni di esportazione o reset.',
    },
    sections: {
      'workspace-basics': {
        title: 'Fondamenti del Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Usa il pulsante Threads in Chat per aprire il thread drawer. I thread possono essere cercati, creati, rinominati ed eliminati e mostrano stati come attivo, approvazione in sospeso o bloccato.',
          'Cmd/Ctrl+Shift+P apre la command palette. Da lì puoi navigare tra i pannelli, gestire i thread, aprire il terminale e lanciare azioni dell’Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat e Composer',
        items: [
          'Scegli un provider e un modello nel composer rail prima di inviare. Se un modello selezionato in precedenza scompare, aggiorna i dati del provider e scegline un altro.',
          'Execute è la modalità normale con tools. Plan è pianificazione senza tools. Thinking serve solo per brainstorming e non esegue tools.',
          'Il Composer supporta testo, immagini e allegati quando il modello selezionato lo consente. Alcuni allegati possono anche essere aggiunti alla OpenAI Knowledge Base del progetto.',
          'L’intestazione di Chat mantiene visibili il thread corrente, il permission mode, l’attività del terminale e il riepilogo git mentre lavori.',
        ],
      },
      'execution-and-terminal': {
        title: 'Esecuzione, approvazioni e terminale',
        items: [
          'Il permission mode controlla come vengono approvate le chiamate alle tools: Ask, Autonomy o Full Access. La policy di sicurezza rigida può comunque bloccare azioni non sicure.',
          'Live execution e i turn runbooks mostrano direttamente nella timeline avanzamento, approvazioni, attività delle tools, modifiche ai file e conflitti.',
          'I comandi locali di lunga durata e le risposte OpenAI in background compaiono in Background Jobs, dove possono essere aggiornati o fermati.',
          'Il terminal dock si trova sotto il Composer. Può esplorare sessioni attive, approvazioni in sospeso e cronologia archiviata del terminale e permette di prendere il controllo della shell al posto del modello quando serve.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes e Artifacts',
        items: [
          'L’Editor include albero dei file, più schede, tracciamento delle modifiche non salvate, scorciatoie di salvataggio, anteprima Markdown, pannelli Problems e Outline, inline completion e azioni opzionali di format o fix per il file attivo.',
          'AI on Selection invia la selezione corrente in Chat come contesto per Explain, Fix, Refactor o generazione di test.',
          'Changes mostra lo stato del branch, i file staged e unstaged, i filtri, gli elenchi ricercabili, i dettagli SCM, le azioni di restore e unstage e i commit creati solo dai file staged.',
          'Artifacts conserva la cronologia delle scritture AI e dei suggerimenti staged. Puoi confrontare revisioni, applicare suggerimenti al disco, tornare a una revisione precedente, aprire il file nell’Editor o eliminare la cronologia di Artifacts senza eliminare il file.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory e Continuity',
        items: [
          'I nodi di Memory possono vivere nel thread corrente, nel progetto o a livello globale. Puoi cercarli, fissarli, modificarli, eliminarli, promuoverli, renderli globali o mantenerli nel thread corrente.',
          'Il pannello Memory include anche una vista della cronologia del thread e può esportare JSON di contesto con dati di Memory e Artifacts.',
          'La compressione automatica di Memory può archiviare il materiale più vecchio. Le voci archiviate restano consultabili quando Show archived è attivo.',
          'Gli indicatori di contesto e Continuity in Chat aiutano a capire quanto stato precedente viene portato avanti tra i turni.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base e MoA',
        items: [
          'Le impostazioni dei providers supportano API Keys salvate e, per OpenAI, accesso via API key o via account a seconda della configurazione del provider.',
          'La visibilità del catalogo OpenRouter può nascondere namespace rumorosi senza perdere la selezione esplicita delle route.',
          'La OpenAI Knowledge Base è legata al progetto. I file caricati lì sono separati dagli allegati normali di Chat e vengono usati per il retrieval ospitato con file_search.',
          'La modalità account di OpenAI non supporta ancora gli asset ospitati della Knowledge Base di progetto. Per quel pannello usa la modalità OpenAI API key.',
          'MoA è opzionale. Quando è abilitato aggiunge la configurazione degli agenti in Settings, un pannello laterale in Chat e azioni rapide di agenti diretti in modalità Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings e controlli dei dati',
        items: [
          'Settings ora copre lingua, cartella del progetto, Assistant Prompt Appendix, UI Scaling, updates, configurazione dei providers, Tools & Safety, Memory & Continuity, MoA e Data & Privacy.',
          'Data & Privacy può esportare il thread corrente, importare JSON di thread, cancellare la cronologia del thread o del progetto, eliminare API Keys salvate, pulire i dati di budget provider o di spillover oppure reimpostare completamente i dati locali di ADDOM.',
          'Alcune impostazioni si applicano subito, mentre certi cambiamenti a livello di shell possono ancora richiedere il riavvio dell’app.',
        ],
      },
    },
  }),
  nl: Object.freeze({
    title: 'ADDOM gebruiken',
    updatedLabel: 'Laatst bijgewerkt {{date}}',
    description: 'Actuele gids voor de echte ADDOM-workflow: workspace-instelling, uitvoering in Chat, Editor-tools, Memory, providers en datacontroles.',
    guideBlock: {
      sectionTitle: 'Gebruikersgids',
      sectionDescription: 'Bekijk de huidige ADDOM-workflow, de paneelindeling, het veiligheidsgedrag, de Editor-tools en de datacontroles.',
      guideLabel: 'In-app-gids',
      versionLabel: 'Versie {{version}}',
      updatedLabel: 'Bijgewerkt {{date}}',
      openGuide: 'Gids openen',
      note: 'Gebruik deze gids als de enige referentie voor workspace-instelling, uitvoering in Chat, terminalsessies, Editor- en Artifact-flows, Memory-gedrag, providers en export- of resetacties.',
    },
    sections: {
      'workspace-basics': {
        title: 'Basis van de Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Gebruik de knop Threads in Chat om de thread drawer te openen. Threads kunnen worden gezocht, aangemaakt, hernoemd en verwijderd en tonen staten zoals actief, goedkeuring in behandeling of geblokkeerd.',
          'Met Cmd/Ctrl+Shift+P open je de command palette. Daarmee kun je panels openen, threads beheren, de terminal openen en Editor-acties starten.',
        ],
      },
      'chat-composer': {
        title: 'Chat en Composer',
        items: [
          'Kies een provider en model in de composer rail voordat je verzendt. Als een eerder gekozen model verdwijnt, vernieuw dan de providergegevens en kies een nieuw model.',
          'Execute is de normale modus met tools. Plan is toolvrije planning. Thinking is alleen voor brainstormen en voert geen tools uit.',
          'De Composer ondersteunt tekst, afbeeldingen en bestandsbijlagen wanneer het geselecteerde model dat toelaat. Sommige bijlagen kunnen ook aan de OpenAI Knowledge Base van het project worden toegevoegd.',
          'De Chat-header houdt de huidige thread, de permission mode, terminalactiviteit en git-samenvatting zichtbaar terwijl je werkt.',
        ],
      },
      'execution-and-terminal': {
        title: 'Uitvoering, goedkeuringen en terminal',
        items: [
          'De permission mode bepaalt hoe toolaanroepen worden goedgekeurd: Ask, Autonomy of Full Access. Hard veiligheidsbeleid kan onveilige acties nog steeds blokkeren.',
          'Live execution en turn runbooks tonen voortgang, goedkeuringen, toolactiviteit, bestandswijzigingen en conflicten direct in de timeline.',
          'Langlopende lokale opdrachten en losgekoppelde OpenAI-achtergrondreacties verschijnen in Background Jobs, waar ze kunnen worden ververst of gestopt.',
          'De terminal dock staat onder de Composer. Je kunt er actieve sessies, wachtende goedkeuringen en gearchiveerde terminalgeschiedenis bekijken en indien nodig de shell van het model overnemen.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes en Artifacts',
        items: [
          'De Editor bevat een bestandsboom, meerdere tabbladen, dirty-tracking, sneltoetsen voor opslaan, Markdown-preview, Problems- en Outline-panels, inline completion en optionele format- of fix-acties voor het actieve bestand.',
          'AI on Selection stuurt de huidige selectie naar Chat als context voor Explain, Fix, Refactor of testgeneratie.',
          'Changes toont de branchstatus, staged en unstaged bestanden, filters, doorzoekbare lijsten, SCM-details, restore- en unstage-acties en commits alleen vanuit staged bestanden.',
          'Artifacts bewaart de geschiedenis van AI-schrijfbewerkingen en staged suggesties. Je kunt revisies vergelijken, suggesties naar schijf toepassen, teruggaan naar een oudere revisie, het bestand openen in de Editor of de Artifact-geschiedenis verwijderen zonder het bestand zelf te verwijderen.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory en Continuity',
        items: [
          'Memory-nodes kunnen in de huidige thread, het project of globaal leven. Je kunt ze zoeken, vastzetten, bewerken, verwijderen, promoveren, globaal maken of in de huidige thread houden.',
          'Het Memory-panel bevat ook een threadgeschiedenisweergave en kan context-JSON exporteren met Memory- en Artifact-gegevens.',
          'Automatische Memory-compressie kan ouder materiaal archiveren. Gearchiveerde items blijven zichtbaar wanneer Show archived is ingeschakeld.',
          'Context- en Continuity-indicatoren in Chat helpen uitleggen hoeveel eerdere staat tussen turns wordt meegenomen.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base en MoA',
        items: [
          'Providerinstellingen ondersteunen opgeslagen API Keys en voor OpenAI, afhankelijk van de configuratie, toegang via API key of account.',
          'OpenRouter-cataloguszichtbaarheid kan drukke namespaces verbergen zonder expliciete routeselectie weg te nemen.',
          'De OpenAI Knowledge Base is projectspecifiek. Bestanden die daarheen worden geüpload staan los van gewone Chat-bijlagen en worden gebruikt voor gehoste file_search-retrieval.',
          'OpenAI-accountmodus ondersteunt momenteel geen gehoste project-assets voor de Knowledge Base. Gebruik voor dat panel de OpenAI API key-modus.',
          'MoA is optioneel. Als het is ingeschakeld, voegt het agentconfiguratie in Settings, een zijpaneel in Chat en snelle directe agentacties in Execute-modus toe.',
        ],
      },
      'settings-and-data': {
        title: 'Settings en datacontroles',
        items: [
          'Settings omvat nu taal, projectmap, Assistant Prompt Appendix, UI Scaling, updates, providerinstelling, Tools & Safety, Memory & Continuity, MoA en Data & Privacy.',
          'Data & Privacy kan de huidige thread exporteren, thread-JSON importeren, thread- of projectgeschiedenis wissen, opgeslagen API Keys verwijderen, providerbudget- of spillovergegevens opschonen of alle lokale ADDOM-gegevens volledig resetten.',
          'Sommige instellingen werken direct, terwijl bepaalde wijzigingen op shellniveau nog steeds een herstart van de app kunnen vereisen.',
        ],
      },
    },
  }),
  pl: Object.freeze({
    title: 'Korzystanie z ADDOM',
    updatedLabel: 'Ostatnia aktualizacja {{date}}',
    description: 'Aktualny przewodnik po rzeczywistym workflow ADDOM: konfiguracja workspace, wykonywanie w Chat, narzędzia Editor, Memory, providers i kontrola danych.',
    guideBlock: {
      sectionTitle: 'Przewodnik użytkowania',
      sectionDescription: 'Sprawdź aktualny workflow ADDOM, układ paneli, zachowanie bezpieczeństwa, narzędzia Editor i kontrolę danych.',
      guideLabel: 'Przewodnik w aplikacji',
      versionLabel: 'Wersja {{version}}',
      updatedLabel: 'Zaktualizowano {{date}}',
      openGuide: 'Otwórz przewodnik',
      note: 'Używaj tego przewodnika jako jedynego źródła informacji o konfiguracji workspace, wykonywaniu w Chat, sesjach terminala, przepływach Editor i Artifacts, zachowaniu Memory, providers oraz akcjach eksportu i resetu.',
    },
    sections: {
      'workspace-basics': {
        title: 'Podstawy Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Użyj przycisku Threads w Chat, aby otworzyć thread drawer. Threads można wyszukiwać, tworzyć, zmieniać nazwy i usuwać, a także pokazują stany takie jak aktywny, oczekujący na zgodę lub zablokowany.',
          'Cmd/Ctrl+Shift+P otwiera command palette. Pozwala ona przełączać panele, zarządzać threads, otwierać terminal i uruchamiać akcje Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat i Composer',
        items: [
          'Przed wysłaniem wybierz provider i model w composer rail. Jeśli wcześniej wybrany model zniknie, odśwież dane providera i wybierz nowy model.',
          'Execute to normalny tryb z tools. Plan służy do planowania bez tools. Thinking służy tylko do brainstormingu i nie uruchamia tools.',
          'Composer obsługuje tekst, obrazy i załączniki, jeśli wybrany model na to pozwala. Niektóre załączniki można też dodać do projektowej OpenAI Knowledge Base.',
          'Nagłówek Chat utrzymuje widoczny bieżący thread, permission mode, aktywność terminala i podsumowanie git podczas pracy.',
        ],
      },
      'execution-and-terminal': {
        title: 'Wykonywanie, zgody i terminal',
        items: [
          'Permission mode określa sposób zatwierdzania wywołań tools: Ask, Autonomy lub Full Access. Twarda polityka bezpieczeństwa nadal może blokować niebezpieczne działania.',
          'Live execution i turn runbooks pokazują bezpośrednio na timeline postęp, zgody, aktywność tools, zmiany plików i konflikty.',
          'Długo działające lokalne polecenia i odłączone odpowiedzi OpenAI w tle pojawiają się w Background Jobs, gdzie można je odświeżyć lub zatrzymać.',
          'Terminal dock znajduje się pod Composer. Pozwala przeglądać aktywne sesje, oczekujące zgody i zarchiwizowaną historię terminala oraz przejąć kontrolę nad shellem od modelu, gdy jest to potrzebne.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes i Artifacts',
        items: [
          'Editor zawiera drzewo plików, wiele kart, śledzenie niezapisanych zmian, skróty zapisu, podgląd Markdown, panele Problems i Outline, inline completion oraz opcjonalne akcje format lub fix dla aktywnego pliku.',
          'AI on Selection wysyła bieżące zaznaczenie do Chat jako kontekst dla Explain, Fix, Refactor lub generowania testów.',
          'Changes pokazuje stan gałęzi, pliki staged i unstaged, filtry, listy z wyszukiwaniem, szczegóły SCM, akcje restore i unstage oraz commity tworzone wyłącznie z plików staged.',
          'Artifacts przechowuje historię zapisów AI i staged suggestions. Możesz porównywać rewizje, stosować sugestie do pliku na dysku, wracać do starszej rewizji, otwierać plik w Editor lub usuwać historię Artifacts bez usuwania samego pliku.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory i Continuity',
        items: [
          'Węzły Memory mogą należeć do bieżącego thread, projektu albo zakresu globalnego. Możesz je wyszukiwać, przypinać, edytować, usuwać, promować, przenosić do globalnego zakresu lub zachowywać w bieżącym thread.',
          'Panel Memory zawiera też widok historii thread i potrafi eksportować context JSON z danymi Memory i Artifacts.',
          'Automatyczna kompresja Memory może archiwizować starszy materiał. Zarchiwizowane wpisy pozostają widoczne po włączeniu Show archived.',
          'Wskaźniki context i Continuity w Chat pomagają zrozumieć, ile wcześniejszego stanu jest przenoszone między turns.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base i MoA',
        items: [
          'Ustawienia providers obsługują zapisane API Keys oraz, w przypadku OpenAI, dostęp przez API key lub konto w zależności od konfiguracji providera.',
          'Widoczność katalogu OpenRouter może ukrywać hałaśliwe namespaces bez utraty jawnego wyboru trasy.',
          'OpenAI Knowledge Base jest powiązana z projektem. Pliki przesłane tam są oddzielone od zwykłych załączników Chat i służą do hostowanego retrieval z file_search.',
          'Tryb konta OpenAI nie obsługuje jeszcze hostowanych assets projektowej Knowledge Base. Dla tego panelu użyj trybu OpenAI API key.',
          'MoA jest opcjonalne. Po włączeniu dodaje konfigurację agentów w Settings, panel boczny w Chat i szybkie akcje bezpośrednich agentów w trybie Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings i kontrola danych',
        items: [
          'Settings obejmuje teraz język, folder projektu, Assistant Prompt Appendix, UI Scaling, updates, konfigurację providers, Tools & Safety, Memory & Continuity, MoA i Data & Privacy.',
          'Data & Privacy może eksportować bieżący thread, importować thread JSON, czyścić historię thread lub projektu, usuwać zapisane API Keys, czyścić dane budżetów providerów lub spillover albo całkowicie resetować lokalne dane ADDOM.',
          'Część ustawień działa od razu, ale niektóre zmiany na poziomie shella nadal mogą wymagać restartu aplikacji.',
        ],
      },
    },
  }),
  tr: Object.freeze({
    title: 'ADDOM Kullanımı',
    updatedLabel: 'Son güncelleme {{date}}',
    description: 'ADDOM’un gerçek iş akışına yönelik güncel kılavuz: workspace kurulumu, Chat içinde yürütme, Editor araçları, Memory, provider ayarları ve veri kontrolleri.',
    guideBlock: {
      sectionTitle: 'Kullanım kılavuzu',
      sectionDescription: 'ADDOM’un güncel iş akışını, panel düzenini, güvenlik davranışını, Editor araçlarını ve veri kontrollerini inceleyin.',
      guideLabel: 'Uygulama içi kılavuz',
      versionLabel: 'Sürüm {{version}}',
      updatedLabel: '{{date}} tarihinde güncellendi',
      openGuide: 'Kılavuzu aç',
      note: 'Bu kılavuzu workspace kurulumu, Chat yürütmesi, terminal oturumları, Editor ve Artifacts akışları, Memory davranışı, providers ve dışa aktarma veya sıfırlama işlemleri için tek başvuru noktası olarak kullanın.',
    },
    sections: {
      'workspace-basics': {
        title: 'Workspace Temelleri',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Chat içindeki Threads düğmesiyle thread drawer’ı açın. Threads aranabilir, oluşturulabilir, yeniden adlandırılabilir ve silinebilir; ayrıca aktif, onay bekliyor veya engellendi gibi durumları gösterir.',
          'Cmd/Ctrl+Shift+P command palette’i açar. Buradan paneller arasında gezebilir, thread’leri yönetebilir, terminali açabilir ve Editor eylemlerini çalıştırabilirsiniz.',
        ],
      },
      'chat-composer': {
        title: 'Chat ve Composer',
        items: [
          'Göndermeden önce composer rail üzerinde bir provider ve model seçin. Daha önce seçilmiş bir model kaybolursa provider verilerini yenileyin ve yeni bir model seçin.',
          'Execute araç kullanan normal moddur. Plan araçsız planlama yapar. Thinking yalnızca beyin fırtınası içindir ve araç çalıştırmaz.',
          'Seçili model izin veriyorsa Composer metin, görsel ve dosya eklerini destekler. Bazı ekler projenin OpenAI Knowledge Base bölümüne de eklenebilir.',
          'Chat başlığı siz çalışırken mevcut thread’i, permission mode’u, terminal etkinliğini ve git özetini görünür tutar.',
        ],
      },
      'execution-and-terminal': {
        title: 'Yürütme, onaylar ve terminal',
        items: [
          'Permission mode araç çağrılarının nasıl onaylanacağını belirler: Ask, Autonomy veya Full Access. Sert güvenlik politikası yine de güvensiz eylemleri engelleyebilir.',
          'Live execution ve turn runbooks ilerleme, onaylar, araç etkinliği, dosya değişiklikleri ve çatışmaları doğrudan timeline üzerinde gösterir.',
          'Uzun süren yerel komutlar ve ayrılmış OpenAI arka plan yanıtları Background Jobs içinde görünür; buradan yenilenebilir veya durdurulabilir.',
          'Terminal dock Composer’ın altındadır. Aktif oturumlara, bekleyen onaylara ve arşivlenmiş terminal geçmişine göz atabilir ve gerekirse shell kontrolünü modelden devralabilirsiniz.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes ve Artifacts',
        items: [
          'Editor dosya ağacı, çoklu sekme, kaydedilmemiş değişiklik takibi, kaydetme kısayolları, Markdown önizlemesi, Problems ve Outline panelleri, inline completion ve aktif dosya için isteğe bağlı format veya fix eylemlerini içerir.',
          'AI on Selection geçerli seçimi Explain, Fix, Refactor veya test üretimi bağlamı olarak Chat’e gönderir.',
          'Changes dal durumunu, staged ve unstaged dosyaları, filtreleri, aranabilir listeleri, SCM ayrıntılarını, restore ve unstage eylemlerini ve yalnızca staged dosyalardan oluşturulan commit’leri gösterir.',
          'Artifacts AI yazma geçmişini ve staged suggestions kayıtlarını tutar. Revizyonları karşılaştırabilir, önerileri diske uygulayabilir, daha eski bir revizyona dönebilir, dosyayı Editor’de açabilir veya dosyanın kendisini silmeden Artifacts geçmişini silebilirsiniz.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory ve Continuity',
        items: [
          'Memory düğümleri mevcut thread’de, projede veya global kapsamda olabilir. Bunları arayabilir, sabitleyebilir, düzenleyebilir, silebilir, yükseltebilir, globale taşıyabilir veya mevcut thread’de tutabilirsiniz.',
          'Memory paneli ayrıca bir thread history görünümü içerir ve Memory ile Artifacts verilerini içeren context JSON dışa aktarabilir.',
          'Otomatik Memory sıkıştırması eski içeriği arşivleyebilir. Show archived açıkken arşivlenmiş girdiler incelenmeye devam eder.',
          'Chat içindeki context ve Continuity göstergeleri, önceki durumun turns arasında ne kadar taşındığını açıklamaya yardımcı olur.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base ve MoA',
        items: [
          'Provider ayarları kayıtlı API Keys desteği sunar ve OpenAI için yapılandırmaya bağlı olarak API key veya hesap tabanlı erişim sağlar.',
          'OpenRouter catalog visibility, açık rota seçimini korurken gürültülü namespace’leri gizleyebilir.',
          'OpenAI Knowledge Base proje kapsamlıdır. Buraya yüklenen dosyalar normal Chat eklerinden ayrıdır ve barındırılan file_search retrieval için kullanılır.',
          'OpenAI hesap modu şu anda proje kapsamlı barındırılan Knowledge Base assets desteği sunmuyor. Bu panel için OpenAI API key modunu kullanın.',
          'MoA isteğe bağlıdır. Etkinleştirildiğinde Settings içinde agent yapılandırması, Chat içinde yan panel ve Execute modunda direct-agent hızlı eylemleri eklenir.',
        ],
      },
      'settings-and-data': {
        title: 'Settings ve veri kontrolleri',
        items: [
          'Settings artık dil, proje klasörü, Assistant Prompt Appendix, UI Scaling, updates, provider kurulumu, Tools & Safety, Memory & Continuity, MoA ve Data & Privacy bölümlerini kapsar.',
          'Data & Privacy mevcut thread’i dışa aktarabilir, thread JSON içe aktarabilir, thread veya proje geçmişini temizleyebilir, kayıtlı API Keys’i silebilir, provider bütçesi veya spillover verilerini temizleyebilir ya da tüm yerel ADDOM verilerini tamamen sıfırlayabilir.',
          'Bazı ayarlar hemen uygulanır; ancak shell düzeyindeki bazı değişiklikler için uygulamanın yeniden başlatılması gerekebilir.',
        ],
      },
    },
  }),
  uk: Object.freeze({
    title: 'Використання ADDOM',
    updatedLabel: 'Оновлено {{date}}',
    description: 'Актуальний посібник з реального workflow ADDOM: налаштування workspace, виконання в Chat, інструменти Editor, Memory, providers і керування даними.',
    guideBlock: {
      sectionTitle: 'Посібник з використання',
      sectionDescription: 'Перегляньте актуальний workflow ADDOM, структуру панелей, поведінку безпеки, інструменти Editor і керування даними.',
      guideLabel: 'Вбудований посібник',
      versionLabel: 'Версія {{version}}',
      updatedLabel: 'Оновлено {{date}}',
      openGuide: 'Відкрити посібник',
      note: 'Використовуйте цей посібник як єдине джерело для налаштування workspace, виконання в Chat, terminal-сесій, потоків Editor і Artifacts, поведінки Memory, providers та дій експорту або скидання.',
    },
    sections: {
      'workspace-basics': {
        title: 'Основи Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Скористайтеся кнопкою Threads у Chat, щоб відкрити thread drawer. Threads можна шукати, створювати, перейменовувати й видаляти, а також вони показують стани на кшталт активний, очікує погодження або заблокований.',
          'Cmd/Ctrl+Shift+P відкриває command palette. Вона дає змогу переходити між панелями, керувати threads, відкривати terminal і запускати дії Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat і Composer',
        items: [
          'Перед відправленням виберіть provider і модель у composer rail. Якщо раніше вибрана модель зникла, оновіть дані provider і виберіть іншу модель.',
          'Execute — це звичайний режим із tools. Plan — планування без tools. Thinking призначений лише для brainstorming і не запускає tools.',
          'Composer підтримує текст, зображення та вкладення, якщо вибрана модель це дозволяє. Деякі вкладення також можна додати до OpenAI Knowledge Base проєкту.',
          'Заголовок Chat тримає видимими поточний thread, permission mode, активність terminal і зведення git під час роботи.',
        ],
      },
      'execution-and-terminal': {
        title: 'Виконання, погодження й terminal',
        items: [
          'Permission mode визначає, як підтверджуються виклики tools: Ask, Autonomy або Full Access. Жорстка політика безпеки все одно може блокувати небезпечні дії.',
          'Live execution і turn runbooks безпосередньо в timeline показують прогрес, погодження, активність tools, зміни файлів і конфлікти.',
          'Довгі локальні команди й від’єднані фонові відповіді OpenAI з’являються в Background Jobs, де їх можна оновити або зупинити.',
          'Terminal dock розташований під Composer. Він дозволяє переглядати активні сесії, очікувані погодження та архівовану історію terminal, а також за потреби перехоплювати керування shell у моделі.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes і Artifacts',
        items: [
          'Editor містить дерево файлів, кілька вкладок, відстеження незбережених змін, гарячі клавіші збереження, Markdown preview, панелі Problems і Outline, inline completion і необов’язкові дії format або fix для активного файла.',
          'AI on Selection надсилає поточне виділення в Chat як контекст для Explain, Fix, Refactor або генерації тестів.',
          'Changes показує стан гілки, staged і unstaged файли, фільтри, списки з пошуком, подробиці SCM, дії restore та unstage і commit лише зі staged файлів.',
          'Artifacts зберігає історію AI-записів і staged suggestions. Ви можете порівнювати ревізії, застосовувати пропозиції до диска, відкотитися до старішої ревізії, відкрити файл у Editor або видалити історію Artifacts, не видаляючи сам файл.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory і Continuity',
        items: [
          'Вузли Memory можуть належати поточному thread, проєкту або глобальній області. Їх можна шукати, закріплювати, редагувати, видаляти, підвищувати, робити глобальними або залишати в поточному thread.',
          'Панель Memory також має режим thread history і може експортувати context JSON із даними Memory та Artifacts.',
          'Автоматичне стиснення Memory може архівувати старі матеріали. Архівовані записи залишаються доступними, якщо увімкнено Show archived.',
          'Індикатори context і Continuity у Chat допомагають зрозуміти, скільки попереднього стану переноситься між turns.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base і MoA',
        items: [
          'Налаштування providers підтримують збережені API Keys, а для OpenAI — доступ через API key або через акаунт залежно від конфігурації provider.',
          'Видимість каталогу OpenRouter може приховувати шумні namespaces без втрати явного вибору route.',
          'OpenAI Knowledge Base прив’язана до проєкту. Файли, завантажені туди, відокремлені від звичайних вкладень Chat і використовуються для hosted retrieval через file_search.',
          'Режим акаунта OpenAI поки що не підтримує hosted assets проєктної Knowledge Base. Для цієї панелі використовуйте режим OpenAI API key.',
          'MoA — опціональна можливість. Після ввімкнення вона додає конфігурацію agents у Settings, бічну панель у Chat і швидкі direct-agent дії в режимі Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings and data controls',
        items: [
          'Settings тепер охоплює мову, папку проєкту, Assistant Prompt Appendix, UI Scaling, updates, налаштування providers, Tools & Safety, Memory & Continuity, MoA і Data & Privacy.',
          'Data & Privacy може експортувати поточний thread, імпортувати thread JSON, очищати історію thread або проєкту, видаляти збережені API Keys, чистити дані бюджету provider або spillover, або повністю скидати локальні дані ADDOM.',
          'Частина налаштувань застосовується одразу, але деякі зміни на рівні shell усе ще можуть вимагати перезапуску застосунку.',
        ],
      },
    },
  }),
  id: Object.freeze({
    title: 'Menggunakan ADDOM',
    updatedLabel: 'Terakhir diperbarui {{date}}',
    description: 'Panduan terbaru untuk alur kerja ADDOM yang sebenarnya: pengaturan workspace, eksekusi di Chat, alat Editor, Memory, providers, dan kontrol data.',
    guideBlock: {
      sectionTitle: 'Panduan penggunaan',
      sectionDescription: 'Tinjau alur kerja ADDOM saat ini, susunan panel, perilaku keamanan, alat Editor, dan kontrol data.',
      guideLabel: 'Panduan di aplikasi',
      versionLabel: 'Versi {{version}}',
      updatedLabel: 'Diperbarui {{date}}',
      openGuide: 'Buka panduan',
      note: 'Gunakan panduan ini sebagai referensi tunggal untuk pengaturan workspace, eksekusi Chat, sesi terminal, alur Editor dan Artifacts, perilaku Memory, providers, dan tindakan ekspor atau reset.',
    },
    sections: {
      'workspace-basics': {
        title: 'Dasar Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Gunakan tombol Threads di Chat untuk membuka thread drawer. Threads dapat dicari, dibuat, diganti nama, dan dihapus, serta menampilkan status seperti aktif, menunggu persetujuan, atau diblokir.',
          'Cmd/Ctrl+Shift+P membuka command palette. Dari sana Anda bisa berpindah panel, mengelola threads, membuka terminal, dan menjalankan aksi Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat dan Composer',
        items: [
          'Pilih provider dan model di composer rail sebelum mengirim. Jika model yang sebelumnya dipilih hilang, segarkan data provider dan pilih model lain.',
          'Execute adalah mode normal yang memakai tools. Plan adalah perencanaan tanpa tools. Thinking hanya untuk brainstorming dan tidak menjalankan tools.',
          'Composer mendukung teks, gambar, dan lampiran file saat model yang dipilih mengizinkannya. Beberapa lampiran juga bisa ditambahkan ke OpenAI Knowledge Base proyek.',
          'Header Chat menampilkan thread saat ini, permission mode, aktivitas terminal, dan ringkasan git saat Anda bekerja.',
        ],
      },
      'execution-and-terminal': {
        title: 'Eksekusi, persetujuan, dan terminal',
        items: [
          'Permission mode menentukan cara panggilan tools disetujui: Ask, Autonomy, atau Full Access. Kebijakan keamanan keras tetap dapat memblokir tindakan yang tidak aman.',
          'Live execution dan turn runbooks menampilkan progres, persetujuan, aktivitas tools, perubahan file, dan konflik langsung di timeline.',
          'Perintah lokal yang berjalan lama dan respons latar belakang OpenAI yang dipisahkan akan muncul di Background Jobs, tempat Anda bisa menyegarkan atau menghentikannya.',
          'Terminal dock berada di bawah Composer. Anda dapat menelusuri sesi aktif, persetujuan tertunda, dan riwayat terminal yang diarsipkan, serta mengambil alih kontrol shell dari model bila perlu.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes, dan Artifacts',
        items: [
          'Editor mencakup pohon file, banyak tab, pelacakan perubahan yang belum disimpan, pintasan simpan, pratinjau Markdown, panel Problems dan Outline, inline completion, serta aksi format atau fix opsional untuk file aktif.',
          'AI on Selection mengirim seleksi saat ini ke Chat sebagai konteks untuk Explain, Fix, Refactor, atau pembuatan test.',
          'Changes menampilkan status branch, file staged dan unstaged, filter, daftar yang bisa dicari, detail SCM, aksi restore dan unstage, serta commit yang dibuat hanya dari file staged.',
          'Artifacts menyimpan riwayat penulisan AI dan staged suggestions. Anda dapat membandingkan revisi, menerapkan saran ke disk, kembali ke revisi lama, membuka file di Editor, atau menghapus riwayat Artifacts tanpa menghapus file itu sendiri.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory dan Continuity',
        items: [
          'Node Memory dapat berada di thread saat ini, proyek, atau cakupan global. Anda dapat mencari, menyematkan, mengedit, menghapus, menaikkan, menjadikannya global, atau tetap menyimpannya di thread saat ini.',
          'Panel Memory juga memiliki tampilan riwayat thread dan dapat mengekspor context JSON yang berisi data Memory dan Artifacts.',
          'Kompresi Memory otomatis dapat mengarsipkan materi lama. Entri yang diarsipkan tetap dapat ditinjau saat Show archived diaktifkan.',
          'Indikator context dan Continuity di Chat membantu menjelaskan seberapa banyak state sebelumnya yang dibawa antarturn.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base, dan MoA',
        items: [
          'Pengaturan providers mendukung API Keys yang disimpan dan, untuk OpenAI, akses berbasis API key atau akun tergantung konfigurasi provider.',
          'Visibilitas katalog OpenRouter dapat menyembunyikan namespace yang berisik tanpa menghilangkan pemilihan route secara eksplisit.',
          'OpenAI Knowledge Base bersifat per proyek. File yang diunggah ke sana terpisah dari lampiran Chat biasa dan digunakan untuk hosted file_search retrieval.',
          'Mode akun OpenAI saat ini belum mendukung hosted project assets untuk Knowledge Base. Gunakan mode OpenAI API key untuk panel tersebut.',
          'MoA bersifat opsional. Saat diaktifkan, fitur ini menambahkan konfigurasi agent di Settings, panel samping di Chat, dan aksi cepat direct-agent di mode Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings dan kontrol data',
        items: [
          'Settings sekarang mencakup bahasa, folder proyek, Assistant Prompt Appendix, UI Scaling, updates, pengaturan provider, Tools & Safety, Memory & Continuity, MoA, dan Data & Privacy.',
          'Data & Privacy dapat mengekspor thread saat ini, mengimpor thread JSON, menghapus riwayat thread atau proyek, menghapus API Keys yang disimpan, membersihkan data anggaran provider atau spillover, atau mereset seluruh data lokal ADDOM.',
          'Sebagian pengaturan berlaku langsung, tetapi beberapa perubahan tingkat shell masih dapat memerlukan restart aplikasi.',
        ],
      },
    },
  }),
  vi: Object.freeze({
    title: 'Sử dụng ADDOM',
    updatedLabel: 'Cập nhật lần cuối {{date}}',
    description: 'Hướng dẫn hiện tại cho workflow thực tế của ADDOM: thiết lập workspace, thực thi trong Chat, công cụ Editor, Memory, providers và kiểm soát dữ liệu.',
    guideBlock: {
      sectionTitle: 'Hướng dẫn sử dụng',
      sectionDescription: 'Xem lại workflow hiện tại của ADDOM, bố cục panel, hành vi an toàn, công cụ Editor và các kiểm soát dữ liệu.',
      guideLabel: 'Hướng dẫn trong ứng dụng',
      versionLabel: 'Phiên bản {{version}}',
      updatedLabel: 'Đã cập nhật {{date}}',
      openGuide: 'Mở hướng dẫn',
      note: 'Dùng hướng dẫn này làm tài liệu tham chiếu duy nhất cho thiết lập workspace, thực thi Chat, phiên terminal, luồng Editor và Artifacts, hành vi của Memory, providers và các thao tác xuất hoặc đặt lại dữ liệu.',
    },
    sections: {
      'workspace-basics': {
        title: 'Cơ bản về Workspace',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Dùng nút Threads trong Chat để mở thread drawer. Threads có thể được tìm kiếm, tạo mới, đổi tên và xóa, đồng thời hiển thị trạng thái như đang hoạt động, chờ phê duyệt hoặc bị chặn.',
          'Cmd/Ctrl+Shift+P mở command palette. Từ đó bạn có thể chuyển panel, quản lý threads, mở terminal và chạy các hành động của Editor.',
        ],
      },
      'chat-composer': {
        title: 'Chat và Composer',
        items: [
          'Chọn provider và model trên composer rail trước khi gửi. Nếu model đã chọn trước đó biến mất, hãy làm mới dữ liệu provider và chọn model khác.',
          'Execute là chế độ bình thường có dùng tools. Plan là chế độ lập kế hoạch không dùng tools. Thinking chỉ dành cho brainstorming và không chạy tools.',
          'Composer hỗ trợ văn bản, hình ảnh và tệp đính kèm nếu model đang chọn cho phép. Một số tệp đính kèm cũng có thể được thêm vào OpenAI Knowledge Base của dự án.',
          'Phần đầu Chat luôn hiển thị thread hiện tại, permission mode, hoạt động terminal và tóm tắt git trong lúc bạn làm việc.',
        ],
      },
      'execution-and-terminal': {
        title: 'Thực thi, phê duyệt và terminal',
        items: [
          'Permission mode quyết định cách các lời gọi tools được phê duyệt: Ask, Autonomy hoặc Full Access. Chính sách an toàn cứng vẫn có thể chặn các hành động không an toàn.',
          'Live execution và turn runbooks hiển thị trực tiếp trên timeline tiến độ, phê duyệt, hoạt động tools, thay đổi tệp và xung đột.',
          'Các lệnh cục bộ chạy lâu và phản hồi nền của OpenAI sẽ xuất hiện trong Background Jobs, nơi bạn có thể làm mới hoặc dừng chúng.',
          'Terminal dock nằm bên dưới Composer. Nó cho phép duyệt các phiên đang chạy, phê duyệt đang chờ và lịch sử terminal đã lưu trữ, đồng thời cho phép bạn giành quyền điều khiển shell từ model khi cần.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes và Artifacts',
        items: [
          'Editor có cây tệp, nhiều tab, theo dõi thay đổi chưa lưu, phím tắt lưu, xem trước Markdown, panel Problems và Outline, inline completion và các hành động format hoặc fix tùy chọn cho tệp đang hoạt động.',
          'AI on Selection gửi vùng chọn hiện tại vào Chat làm ngữ cảnh cho Explain, Fix, Refactor hoặc tạo test.',
          'Changes hiển thị trạng thái branch, tệp staged và unstaged, bộ lọc, danh sách có tìm kiếm, chi tiết SCM, hành động restore và unstage, cùng commit chỉ từ các tệp staged.',
          'Artifacts lưu lịch sử ghi của AI và staged suggestions. Bạn có thể so sánh các revision, áp dụng suggestion xuống đĩa, quay lại revision cũ, mở tệp trong Editor hoặc xóa lịch sử Artifacts mà không xóa chính tệp đó.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory và Continuity',
        items: [
          'Các node Memory có thể nằm trong thread hiện tại, trong dự án hoặc ở phạm vi toàn cục. Bạn có thể tìm kiếm, ghim, chỉnh sửa, xóa, nâng cấp, chuyển sang global hoặc giữ chúng trong thread hiện tại.',
          'Panel Memory cũng có chế độ xem lịch sử thread và có thể xuất context JSON chứa dữ liệu Memory và Artifacts.',
          'Nén Memory tự động có thể lưu trữ nội dung cũ. Các mục đã lưu trữ vẫn có thể xem lại khi bật Show archived.',
          'Các chỉ báo context và Continuity trong Chat giúp giải thích lượng trạng thái trước đó đang được mang sang giữa các turns.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base và MoA',
        items: [
          'Phần cài đặt providers hỗ trợ API Keys đã lưu và, với OpenAI, hỗ trợ truy cập bằng API key hoặc tài khoản tùy theo cấu hình provider.',
          'Tùy chọn hiển thị danh mục OpenRouter có thể ẩn các namespace quá ồn mà vẫn giữ khả năng chọn route một cách tường minh.',
          'OpenAI Knowledge Base có phạm vi theo dự án. Các tệp tải lên ở đây tách biệt với tệp đính kèm Chat thông thường và được dùng cho hosted file_search retrieval.',
          'Chế độ tài khoản OpenAI hiện chưa hỗ trợ hosted project assets cho Knowledge Base. Hãy dùng chế độ OpenAI API key cho panel đó.',
          'MoA là tùy chọn. Khi bật, nó sẽ thêm phần cấu hình agent trong Settings, panel bên ở Chat và các thao tác nhanh direct-agent trong chế độ Execute.',
        ],
      },
      'settings-and-data': {
        title: 'Settings and data controls',
        items: [
          'Settings hiện bao gồm ngôn ngữ, thư mục dự án, Assistant Prompt Appendix, UI Scaling, updates, thiết lập provider, Tools & Safety, Memory & Continuity, MoA và Data & Privacy.',
          'Data & Privacy có thể xuất thread hiện tại, nhập thread JSON, xóa lịch sử thread hoặc dự án, xóa API Keys đã lưu, dọn dữ liệu ngân sách provider hoặc spillover, hoặc đặt lại hoàn toàn dữ liệu cục bộ của ADDOM.',
          'Một số thiết lập có hiệu lực ngay lập tức, trong khi một số thay đổi ở mức shell vẫn có thể yêu cầu khởi động lại ứng dụng.',
        ],
      },
    },
  }),
  ja: Object.freeze({
    title: 'ADDOM の使い方',
    updatedLabel: '{{date}} 更新',
    description: '現在の ADDOM の実際のワークフローをまとめたガイドです。workspace の設定、Chat での実行、Editor の機能、Memory、provider 設定、データ管理を扱います。',
    guideBlock: {
      sectionTitle: '利用ガイド',
      sectionDescription: '現在の ADDOM のワークフロー、パネル構成、安全動作、Editor ツール、データ管理を確認できます。',
      guideLabel: 'アプリ内ガイド',
      versionLabel: 'バージョン {{version}}',
      updatedLabel: '{{date}} 更新',
      openGuide: 'ガイドを開く',
      note: 'このガイドを、workspace 設定、Chat 実行、terminal セッション、Editor と Artifacts の流れ、Memory の扱い、provider 設定、エクスポートやリセット操作の共通リファレンスとして使ってください。',
    },
    sections: {
      'workspace-basics': {
        title: 'Workspace の基本',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Chat の Threads ボタンで thread drawer を開きます。threads は検索、作成、名前変更、削除ができ、アクティブ、承認待ち、ブロック中などの状態も表示されます。',
          'Cmd/Ctrl+Shift+P で command palette を開けます。ここからパネル移動、thread 管理、terminal の起動、Editor アクションの実行ができます。',
        ],
      },
      'chat-composer': {
        title: 'Chat と Composer',
        items: [
          '送信前に composer rail で provider と model を選択します。以前選んだ model が消えた場合は provider 情報を更新して別の model を選んでください。',
          'Execute は通常の tool 実行モードです。Plan は tool を使わない計画モードです。Thinking はブレインストーミング専用で、tool は実行しません。',
          '選択した model が対応していれば、Composer はテキスト、画像、ファイル添付を扱えます。一部の添付ファイルはプロジェクトの OpenAI Knowledge Base にも追加できます。',
          'Chat ヘッダーには、現在の thread、permission mode、terminal の状態、git の概要が常に表示されます。',
        ],
      },
      'execution-and-terminal': {
        title: '実行、承認、Terminal',
        items: [
          'permission mode は tool 呼び出しをどう承認するかを決めます。Ask、Autonomy、Full Access のいずれかです。危険な操作は厳格な安全ポリシーで引き続きブロックされることがあります。',
          'live execution と turn runbook では、進行状況、承認、tool の動き、ファイル変更、競合が timeline 上に直接表示されます。',
          '長時間動くローカルコマンドや切り離された OpenAI のバックグラウンド応答は Background Jobs に表示され、更新や停止ができます。',
          'terminal dock は Composer の下にあります。稼働中のセッション、承認待ち、保存済みの terminal 履歴を見られ、必要なら model から shell 制御を引き継げます。',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor、Changes、Artifacts',
        items: [
          'Editor にはファイルツリー、複数タブ、未保存変更の追跡、保存ショートカット、Markdown プレビュー、Problems / Outline パネル、inline completion、アクティブなファイル向けの format / fix アクションが含まれます。',
          'AI on Selection は現在の選択範囲を Explain、Fix、Refactor、テスト生成のコンテキストとして Chat に送ります。',
          'Changes では branch 状態、staged / unstaged ファイル、フィルター、検索可能な一覧、SCM 詳細、restore / unstage 操作、staged ファイルだけからの commit を確認できます。',
          'Artifacts には AI の書き込み履歴と staged suggestions が保存されます。revision の比較、提案のディスク反映、古い revision へのロールバック、Editor でのファイルオープン、ファイル自体を消さずに Artifacts 履歴だけを削除することができます。',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory と Continuity',
        items: [
          'Memory ノードは現在の thread、プロジェクト、またはグローバルに置けます。検索、ピン留め、編集、削除、昇格、グローバル化、現在の thread への保持ができます。',
          'Memory パネルには thread history ビューもあり、Memory と Artifacts を含む context JSON をエクスポートできます。',
          '自動 Memory 圧縮によって古い内容をアーカイブできます。Show archived を有効にすると、アーカイブ済み項目も確認できます。',
          'Chat の context と Continuity の表示は、過去の状態が turns をまたいでどれだけ引き継がれているかを説明する助けになります。',
        ],
      },
      'providers-and-moa': {
        title: 'Providers、Knowledge Base、MoA',
        items: [
          'provider 設定では保存済み API Keys を扱えます。OpenAI では設定に応じて API key アクセスまたはアカウントアクセスを使えます。',
          'OpenRouter catalog visibility を使うと、明示的な route 選択を残したまま、ノイズの多い namespace を非表示にできます。',
          'OpenAI Knowledge Base はプロジェクト単位です。ここにアップロードしたファイルは通常の Chat 添付と分離され、hosted file_search retrieval に使われます。',
          'OpenAI の account mode は現在、プロジェクト用の hosted Knowledge Base assets に対応していません。このパネルでは OpenAI API key mode を使ってください。',
          'MoA は任意機能です。有効化すると Settings の agent 設定、Chat のサイドパネル、Execute モードの direct-agent クイック操作が追加されます。',
        ],
      },
      'settings-and-data': {
        title: 'Settings、データ管理',
        items: [
          'Settings では 、言語、プロジェクトフォルダ、Assistant Prompt Appendix、UI Scaling、updates、provider 設定、Tools & Safety、Memory & Continuity、MoA、Data & Privacy を扱います。',
          'Data & Privacy では現在の thread のエクスポート、thread JSON のインポート、thread / project 履歴の削除、保存済み API Keys の削除、provider budget / spillover データの掃除、ADDOM のローカルデータの完全リセットができます。',
          '一部の設定はすぐに反映されますが、shell レベルの変更はアプリ再起動が必要な場合があります。',
        ],
      },
    },
  }),
  ko: Object.freeze({
    title: 'ADDOM 사용 가이드',
    updatedLabel: '{{date}} 업데이트',
    description: '현재 ADDOM의 실제 워크플로를 설명하는 가이드입니다. workspace 설정, Chat 실행, Editor 도구, Memory, provider 설정, 데이터 제어를 다룹니다.',
    guideBlock: {
      sectionTitle: '사용 가이드',
      sectionDescription: '현재 ADDOM 워크플로, 패널 구성, 안전 동작, Editor 도구, 데이터 제어를 확인할 수 있습니다.',
      guideLabel: '앱 내 가이드',
      versionLabel: '버전 {{version}}',
      updatedLabel: '{{date}} 업데이트',
      openGuide: '가이드 열기',
      note: '이 가이드를 workspace 설정, Chat 실행, terminal 세션, Editor 및 Artifacts 흐름, Memory 동작, provider 설정, 내보내기 또는 초기화 작업을 위한 단일 기준 문서로 사용하세요.',
    },
    sections: {
      'workspace-basics': {
        title: 'Workspace 기본',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          'Chat의 Threads 버튼으로 thread drawer를 엽니다. threads는 검색, 생성, 이름 변경, 삭제가 가능하며 활성, 승인 대기, 차단됨 같은 상태를 보여줍니다.',
          'Cmd/Ctrl+Shift+P로 command palette를 엽니다. 여기서 패널 이동, thread 관리, terminal 열기, Editor 작업 실행이 가능합니다.',
        ],
      },
      'chat-composer': {
        title: 'Chat과 Composer',
        items: [
          '보내기 전에 composer rail에서 provider와 model을 선택하세요. 이전에 선택한 model이 사라졌다면 provider 데이터를 새로고침하고 다른 model을 선택하면 됩니다.',
          'Execute는 일반적인 tool 실행 모드입니다. Plan은 tool 없이 계획만 세우는 모드입니다. Thinking은 브레인스토밍 전용이며 tool을 실행하지 않습니다.',
          '선택한 model이 허용하면 Composer는 텍스트, 이미지, 파일 첨부를 지원합니다. 일부 첨부 파일은 프로젝트의 OpenAI Knowledge Base에도 추가할 수 있습니다.',
          'Chat 헤더에는 현재 thread, permission mode, terminal 상태, git 요약이 작업 중에도 계속 표시됩니다.',
        ],
      },
      'execution-and-terminal': {
        title: '실행, 승인, Terminal',
        items: [
          'permission mode는 tool 호출을 어떻게 승인할지 정합니다. Ask, Autonomy, Full Access 중 하나를 사용하며, 위험한 작업은 엄격한 보안 정책으로 계속 차단될 수 있습니다.',
          'live execution과 turn runbook은 진행 상황, 승인, tool 활동, 파일 변경, 충돌을 timeline에 직접 표시합니다.',
          '오래 실행되는 로컬 명령과 분리된 OpenAI 백그라운드 응답은 Background Jobs에 표시되며, 여기서 새로고침하거나 중지할 수 있습니다.',
          'terminal dock은 Composer 아래에 있습니다. 활성 세션, 승인 대기, 보관된 terminal 기록을 둘러볼 수 있고, 필요하면 model로부터 shell 제어를 가져올 수 있습니다.',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor, Changes, Artifacts',
        items: [
          'Editor에는 파일 트리, 여러 탭, 저장되지 않은 변경 추적, 저장 단축키, Markdown 미리보기, Problems 및 Outline 패널, inline completion, 활성 파일용 format/fix 작업이 포함됩니다.',
          'AI on Selection은 현재 선택 영역을 Explain, Fix, Refactor, 테스트 생성용 컨텍스트로 Chat에 보냅니다.',
          'Changes에서는 branch 상태, staged/unstaged 파일, 필터, 검색 가능한 목록, SCM 세부 정보, restore/unstage 작업, staged 파일만으로 만드는 commit을 볼 수 있습니다.',
          'Artifacts는 AI 쓰기 이력과 staged suggestions를 저장합니다. revision 비교, 제안 디스크 적용, 이전 revision으로 롤백, Editor에서 파일 열기, 파일 자체를 삭제하지 않고 Artifacts 기록만 삭제하기가 가능합니다.',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory와 Continuity',
        items: [
          'Memory 노드는 현재 thread, 프로젝트, 전역 범위에 둘 수 있습니다. 검색, 고정, 편집, 삭제, 승격, 전역 이동, 현재 thread 유지가 가능합니다.',
          'Memory 패널에는 thread history 보기 또한 있으며, Memory와 Artifacts 데이터를 포함한 context JSON을 내보낼 수 있습니다.',
          '자동 Memory 압축은 오래된 내용을 보관할 수 있습니다. Show archived를 켜면 보관된 항목도 계속 검토할 수 있습니다.',
          'Chat의 context 및 Continuity 표시기는 이전 상태가 turns 사이에서 얼마나 이어지는지 이해하는 데 도움을 줍니다.',
        ],
      },
      'providers-and-moa': {
        title: 'Providers, Knowledge Base, MoA',
        items: [
          'provider 설정은 저장된 API Keys를 지원하며, OpenAI는 구성에 따라 API key 접근 또는 계정 기반 접근을 지원합니다.',
          'OpenRouter catalog visibility를 사용하면 명시적 route 선택은 유지한 채 시끄러운 namespace를 숨길 수 있습니다.',
          'OpenAI Knowledge Base는 프로젝트 범위입니다. 여기 업로드한 파일은 일반 Chat 첨부와 분리되며 hosted file_search retrieval에 사용됩니다.',
          'OpenAI account mode는 현재 프로젝트용 hosted Knowledge Base assets를 지원하지 않습니다. 이 패널에서는 OpenAI API key mode를 사용하세요.',
          'MoA는 선택 기능입니다. 켜면 Settings의 agent 구성, Chat의 사이드 패널, Execute 모드의 direct-agent 빠른 작업이 추가됩니다.',
        ],
      },
      'settings-and-data': {
        title: 'Settings and data controls',
        items: [
          'Settings는 언어, 프로젝트 폴더, Assistant Prompt Appendix, UI Scaling, updates, provider 설정, Tools & Safety, Memory & Continuity, MoA, Data & Privacy를 다룹니다.',
          'Data & Privacy에서는 현재 thread 내보내기, thread JSON 가져오기, thread/프로젝트 기록 삭제, 저장된 API Keys 삭제, provider budget/spillover 데이터 정리, ADDOM 로컬 데이터 전체 초기화를 수행할 수 있습니다.',
          '일부 설정은 바로 적용되지만, shell 수준의 일부 변경은 여전히 앱 재시작이 필요할 수 있습니다.',
        ],
      },
    },
  }),
  'zh-CN': Object.freeze({
    title: '使用 ADDOM',
    updatedLabel: '最后更新 {{date}}',
    description: '这是一份面向当前 ADDOM 实际工作流的指南，涵盖 workspace 设置、Chat 执行、Editor 工具、Memory、provider 配置和数据控制。',
    guideBlock: {
      sectionTitle: '使用指南',
      sectionDescription: '查看当前 ADDOM 的工作流、面板结构、安全行为、Editor 工具和数据控制。',
      guideLabel: '应用内指南',
      versionLabel: '版本 {{version}}',
      updatedLabel: '更新于 {{date}}',
      openGuide: '打开指南',
      note: '把这份指南作为 workspace 设置、Chat 执行、terminal 会话、Editor 与 Artifacts 流程、Memory 行为、provider 设置以及导出或重置操作的统一参考。',
    },
    sections: {
      'workspace-basics': {
        title: 'Workspace 基础',
        items: [
          'Open a project from Projects in the shell; Chat, Editor, Changes, Artifacts, Memory, and Settings stay in the same app window.',
          'The sidebar switches panels, Projects opens project entry, and the folder shortcut opens the current project on disk.',
          '在 Chat 中使用 Threads 按钮打开 thread drawer。threads 可以搜索、创建、重命名和删除，并会显示活动、等待批准或已阻止等状态。',
          '按 Cmd/Ctrl+Shift+P 打开 command palette。你可以在其中切换面板、管理 threads、打开 terminal，并触发 Editor 动作。',
        ],
      },
      'chat-composer': {
        title: 'Chat 与 Composer',
        items: [
          '发送前请先在 composer rail 中选择 provider 和 model。如果之前选中的 model 不再可用，请刷新 provider 数据并重新选择。',
          'Execute 是正常的工具执行模式。Plan 用于不运行工具的规划。Thinking 只用于头脑风暴，不会执行工具。',
          '如果所选 model 支持，Composer 可以处理文本、图片和文件附件。部分附件还可以加入项目的 OpenAI Knowledge Base。',
          'Chat 顶部会一直显示当前 thread、permission mode、terminal 活动以及 git 摘要，方便你边做边看。',
        ],
      },
      'execution-and-terminal': {
        title: '执行、批准与 Terminal',
        items: [
          'permission mode 决定 tool 调用如何获批，可选 Ask、Autonomy 或 Full Access。严格安全策略仍然可能阻止不安全操作。',
          'live execution 和 turn runbook 会在 timeline 中直接展示进度、批准、tool 活动、文件变更和冲突。',
          '长时间运行的本地命令和分离的 OpenAI 后台响应会出现在 Background Jobs 中，你可以在那里刷新或停止它们。',
          'terminal dock 位于 Composer 下方。你可以浏览活动会话、待批准操作和已归档的 terminal 历史，并在需要时从 model 手中接管 shell 控制权。',
        ],
      },
      'editor-and-reviews': {
        title: 'Editor、Changes 与 Artifacts',
        items: [
          'Editor 提供文件树、多标签页、未保存变更跟踪、保存快捷键、Markdown 预览、Problems 和 Outline 面板、inline completion，以及针对当前文件的可选 format 或 fix 动作。',
          'AI on Selection 会把当前选区发送到 Chat，作为 Explain、Fix、Refactor 或测试生成的上下文。',
          'Changes 会显示分支状态、staged 与 unstaged 文件、过滤器、可搜索列表、SCM 详情、restore 与 unstage 动作，以及只基于 staged 文件创建的 commit。',
          'Artifacts 会保存 AI 写入历史和 staged suggestions。你可以比较 revision、把建议应用到磁盘、回滚到旧 revision、在 Editor 中打开文件，或删除 Artifacts 历史而不删除文件本身。',
        ],
      },
      'memory-and-continuity': {
        title: 'Memory 与 Continuity',
        items: [
          'Memory 节点可以属于当前 thread、当前项目或全局范围。你可以搜索、置顶、编辑、删除、提升范围、设为全局，或保留在当前 thread 中。',
          'Memory 面板还提供 thread history 视图，并可导出包含 Memory 和 Artifacts 数据的 context JSON。',
          '自动 Memory 压缩可以归档较旧内容。启用 Show archived 后，已归档条目仍然可以查看。',
          'Chat 中的 context 和 Continuity 指示器可以帮助解释有多少历史状态被跨 turns 继续带入。',
        ],
      },
      'providers-and-moa': {
        title: 'Providers、Knowledge Base 与 MoA',
        items: [
          'provider 设置支持保存 API Keys；对于 OpenAI，则会根据配置使用 API key 访问或账号访问。',
          'OpenRouter catalog visibility 可以隐藏噪声较大的 namespace，同时保留显式 route 选择能力。',
          'OpenAI Knowledge Base 是项目级的。上传到这里的文件与普通 Chat 附件分离，用于托管的 file_search retrieval。',
          'OpenAI account mode 目前不支持项目级托管 Knowledge Base assets。该面板请改用 OpenAI API key mode。',
          'MoA 是可选功能。开启后，它会在 Settings 中增加 agent 配置，在 Chat 中增加侧边面板，并在 Execute 模式下提供 direct-agent 快捷操作。',
        ],
      },
      'settings-and-data': {
        title: 'Settings 与数据控制',
        items: [
          'Settings 现在涵盖 、语言、项目文件夹、Assistant Prompt Appendix、UI Scaling、updates、provider 设置、Tools & Safety、Memory & Continuity、MoA 和 Data & Privacy。',
          'Data & Privacy 可以导出当前 thread、导入 thread JSON、清理 thread 或项目历史、删除已保存的 API Keys、清理 provider budget 或 spillover 数据，或彻底重置本地 ADDOM 数据。',
          '部分设置会立即生效，但某些 shell 级别的更改仍可能需要重启应用。',
        ],
      },
    },
  }),
})

function applyTemplate(template = '', values = {}) {
  return String(template || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const value = values?.[key]
    return value == null ? '' : String(value)
  })
}

function resolveGuideLocale(locale = '') {
  const normalized = normalizeUiLocale(locale, DEFAULT_UI_LOCALE)
  return LOCALIZED_GUIDE_COPY[normalized] ? normalized : DEFAULT_UI_LOCALE
}

export function getLocalizedInstructionsCatalog(locale = '') {
  const resolvedLocale = resolveGuideLocale(locale)
  const localized = LOCALIZED_GUIDE_COPY[resolvedLocale] || CATALOG_COPY_BASE

  return {
    ...INSTRUCTIONS_CATALOG,
    title: localized.title || CATALOG_COPY_BASE.title,
    description: localized.description || CATALOG_COPY_BASE.description,
    updatedLabel: localized.updatedLabel || CATALOG_COPY_BASE.updatedLabel,
    sections: INSTRUCTIONS_CATALOG.sections.map((section) => {
      const override = localized.sections?.[section.id]
      return {
        ...section,
        title: override?.title || section.title,
        items: Array.isArray(override?.items) && override.items.length === section.items.length
          ? override.items
          : section.items,
      }
    }),
  }
}

export function getLocalizedInstructionsGuideBlock(locale = '') {
  const resolvedLocale = resolveGuideLocale(locale)
  const localized = LOCALIZED_GUIDE_COPY[resolvedLocale]?.guideBlock || {}
  return {
    ...GUIDE_BLOCK_BASE,
    ...localized,
  }
}

export function interpolateInstructionsText(template = '', values = {}) {
  return applyTemplate(template, values)
}
