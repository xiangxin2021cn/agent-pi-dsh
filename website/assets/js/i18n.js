/* Agent Pi DSH homepage translations. Chinese and English remain the authored
   source languages; the other locales translate the primary homepage journey
   and intentionally fall back to English for specialist detail. */
(function () {
  "use strict";

  var LOCALES = ["zh-CN", "en", "es", "fr", "de", "ja", "ko", "pt", "ar", "ru"];
  var LANGUAGE_NAMES = {
    "zh-CN": "简体中文",
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    ja: "日本語",
    ko: "한국어",
    pt: "Português",
    ar: "العربية",
    ru: "Русский"
  };
  var TRANSLATED_LOCALES = ["es", "fr", "de", "ja", "ko", "pt", "ar", "ru"];
  var phrases = Object.create(null);

  function add(source, es, fr, de, ja, ko, pt, ar, ru) {
    var values = [es, fr, de, ja, ko, pt, ar, ru];
    var row = Object.create(null);
    TRANSLATED_LOCALES.forEach(function (locale, index) { row[locale] = values[index]; });
    phrases[normaliseText(source)] = row;
  }

  /* Navigation and hero. */
  add("Why", "Por qué", "Pourquoi", "Warum", "特長", "특징", "Porquê", "لماذا", "Почему");
  add("Tender flow", "Flujo de licitación", "Processus d'appel d'offres", "Ablauf der Ausschreibung", "入札フロー", "입찰 흐름", "Fluxo de licitação", "مسار العطاء", "Процесс тендера");
  add("Showcase", "Resultados", "Réalisations", "Ergebnisse", "成果", "결과물", "Resultados", "النتائج", "Результаты");
  add("Architecture", "Arquitectura", "Architecture", "Architektur", "アーキテクチャ", "아키텍처", "Arquitetura", "البنية", "Архитектура");
  add("Docs", "Documentación", "Documentation", "Dokumentation", "ドキュメント", "문서", "Documentação", "الوثائق", "Документация");
  add("The vertical agent for engineering firms Long-horizon jobs, finished in one run",
    "El agente vertical para empresas de ingeniería<br><span class=\"grad-text\">Tareas de larga duración, terminadas en una sola ejecución</span>",
    "L'agent vertical des entreprises d'ingénierie<br><span class=\"grad-text\">Les missions longues, achevées en une seule exécution</span>",
    "Der vertikale Agent für Ingenieurunternehmen<br><span class=\"grad-text\">Langzeitaufgaben in einem Durchlauf erledigt</span>",
    "エンジニアリング企業のための垂直型エージェント<br><span class=\"grad-text\">長期タスクを一度の実行で完遂</span>",
    "엔지니어링 기업을 위한 버티컬 에이전트<br><span class=\"grad-text\">장기 작업을 한 번의 실행으로 완료</span>",
    "O agente vertical para empresas de engenharia<br><span class=\"grad-text\">Tarefas longas concluídas em uma única execução</span>",
    "الوكيل المتخصص لشركات الهندسة<br><span class=\"grad-text\">مهام طويلة تُنجز في تشغيل واحد</span>",
    "Вертикальный агент для инженерных компаний<br><span class=\"grad-text\">Длительные задачи за один запуск</span>");
  add("Generic assistants chat. Agent Pi DSH does the job — a vertical workbench for tendering, delivery and investment. Long-horizon runs that never drift, evidence at every step: dozens of tender files in one run, thousands of BOQ items derived line by line, deliverables written to disk as official documents.",
    "Los asistentes genéricos conversan; Agent Pi DSH hace el trabajo. Es un entorno vertical para licitación, ejecución e inversión: mantiene el objetivo, conserva la evidencia, analiza decenas de documentos y miles de partidas BOQ, y guarda entregables formales.",
    "Les assistants généralistes discutent ; Agent Pi DSH exécute. Cet atelier vertical couvre appels d'offres, réalisation et investissement : objectif stable, preuves traçables, dizaines de dossiers et milliers de postes BOQ, avec des livrables officiels enregistrés.",
    "Allgemeine Assistenten chatten; Agent Pi DSH erledigt die Arbeit. Die vertikale Arbeitsumgebung für Ausschreibung, Ausführung und Investition hält Ziel und Belege fest, verarbeitet Dutzende Dokumente und Tausende BOQ-Positionen und speichert formale Ergebnisse.",
    "汎用アシスタントは会話し、Agent Pi DSH は仕事を実行します。入札・施工・投資に特化し、目標と根拠を維持したまま多数の文書と数千の BOQ 項目を処理し、正式成果物として保存します。",
    "범용 도우미는 대화하고 Agent Pi DSH는 일을 수행합니다. 입찰·시공·투자에 특화되어 목표와 근거를 유지하며 수십 개 문서와 수천 개 BOQ 항목을 처리하고 공식 결과물로 저장합니다.",
    "Assistentes genéricos conversam; o Agent Pi DSH executa. O ambiente vertical de licitação, entrega e investimento mantém objetivo e evidências, processa dezenas de documentos e milhares de itens BOQ e grava entregáveis formais.",
    "المساعدون العامون يتحاورون، أما Agent Pi DSH فينجز العمل. منصة متخصصة للعطاء والتنفيذ والاستثمار تحفظ الهدف والأدلة، وتعالج عشرات الملفات وآلاف بنود BOQ، وتنتج مستندات رسمية.",
    "Обычные ассистенты беседуют, Agent Pi DSH выполняет работу. Вертикальная среда для тендеров, реализации и инвестиций сохраняет цель и доказательства, обрабатывает десятки документов и тысячи позиций BOQ и записывает официальные результаты.");
  add("Choose a download", "Elegir descarga", "Choisir un téléchargement", "Download wählen", "ダウンロードを選択", "다운로드 선택", "Escolher download", "اختر التنزيل", "Выбрать загрузку");
  add("Read the Docs", "Leer la documentación", "Lire la documentation", "Dokumentation lesen", "ドキュメントを読む", "문서 보기", "Ler a documentação", "اقرأ الوثائق", "Читать документацию");
  add("Windows is unsigned: choose “Run anyway” in SmartScreen · Side-by-side with Classic 2.6.5 · New sessions default to",
    "Windows sin firma: elija «Ejecutar de todos modos» en SmartScreen · Compatible con Classic 2.6.5 · Las sesiones nuevas usan",
    "Windows non signé : choisissez « Exécuter quand même » dans SmartScreen · Compatible avec Classic 2.6.5 · Les nouvelles sessions utilisent",
    "Windows ist unsigniert: in SmartScreen „Trotzdem ausführen“ wählen · Parallel zu Classic 2.6.5 · Neue Sitzungen verwenden",
    "Windows 版は未署名です。SmartScreen で「実行」を選択 · Classic 2.6.5 と共存可能 · 新規セッションの既定は",
    "Windows 빌드는 서명되지 않았습니다. SmartScreen에서 ‘실행’을 선택 · Classic 2.6.5와 병행 설치 · 새 세션 기본값",
    "Windows sem assinatura: escolha “Executar assim mesmo” no SmartScreen · Compatível com Classic 2.6.5 · Novas sessões usam",
    "إصدار Windows غير موقّع: اختر «تشغيل على أي حال» في SmartScreen · يعمل بجانب Classic 2.6.5 · الجلسات الجديدة تستخدم",
    "Сборка Windows не подписана: выберите «Выполнить в любом случае» в SmartScreen · Работает рядом с Classic 2.6.5 · Новые сеансы используют");
  add("{{data-rel-version}} · DeepSeek Harness {{data-kernel-version}} kernel",
    "<span data-rel-version>v3.5.2</span> · Núcleo DeepSeek Harness <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · Noyau DeepSeek Harness <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · DeepSeek-Harness-Kernel <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · DeepSeek Harness カーネル <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · DeepSeek Harness 커널 <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · Núcleo DeepSeek Harness <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · نواة DeepSeek Harness <span data-kernel-version>dsh-v0.1.2-alpha.3</span>",
    "<span data-rel-version>v3.5.2</span> · Ядро DeepSeek Harness <span data-kernel-version>dsh-v0.1.2-alpha.3</span>");
  add("Domains: tender / delivery / investment", "Áreas: licitación / ejecución / inversión", "Domaines : appels d'offres / réalisation / investissement", "Bereiche: Ausschreibung / Ausführung / Investition", "領域：入札／施工／投資", "영역: 입찰 / 수행 / 투자", "Domínios: licitação / entrega / investimento", "المجالات: العطاء / التنفيذ / الاستثمار", "Области: тендеры / реализация / инвестиции");
  add("Domain skills shipped out of the box", "Habilidades sectoriales incluidas", "Compétences métier prêtes à l'emploi", "Domänenfähigkeiten sofort einsatzbereit", "標準搭載の業務スキル", "기본 제공 도메인 스킬", "Competências de domínio prontas", "مهارات تخصصية جاهزة", "Готовые отраслевые навыки");
  add("Parallel workers without freezing the window", "Trabajadores paralelos sin bloquear la ventana", "Agents parallèles sans bloquer la fenêtre", "Parallele Worker ohne blockiertes Fenster", "画面を止めない並列ワーカー", "창을 멈추지 않는 병렬 워커", "Trabalhadores paralelos sem travar a janela", "عمال متوازون دون تجميد النافذة", "Параллельные исполнители без зависания окна");
  add("Window: chat, evidence, outputs, citations", "Ventana: chat, evidencias, resultados y citas", "Fenêtre : dialogue, preuves, résultats et sources", "Fenster: Chat, Belege, Ergebnisse, Quellen", "1画面：対話・根拠・成果・出典", "한 화면: 대화·근거·결과·출처", "Janela: conversa, evidências, resultados e citações", "نافذة واحدة: محادثة وأدلة ونتائج ومراجع", "Одно окно: диалог, доказательства, результаты, источники");

  /* Primary section journey. */
  add("Architecture first", "Arquitectura ante todo", "L'architecture d'abord", "Architektur zuerst", "アーキテクチャ優先", "아키텍처 우선", "Arquitetura em primeiro lugar", "البنية أولاً", "Архитектура прежде всего");
  add("No RAG — not because we can't, because we thought it through", "Sin RAG: no por limitación, sino por diseño", "Sans RAG : un choix réfléchi", "Kein RAG – eine bewusste Entscheidung", "RAG を使わないのは、考え抜いた設計だから", "RAG 미사용은 한계가 아니라 설계 선택입니다", "Sem RAG: uma decisão consciente", "بلا RAG: قرار مدروس لا عجز", "Без RAG — осознанный выбор");
  add("The mainstream answer is to pile the knowledge base onto RAG (vector retrieval). Agent Pi DSH made two deliberate counter-choices and one decisive engine swap — all around a single question: can an ordinary office PC finish the hardest tender job end to end.",
    "La práctica común apila la base de conocimiento sobre RAG. Agent Pi DSH tomó decisiones distintas para responder a una pregunta: ¿puede un PC de oficina completar de principio a fin el trabajo de licitación más difícil?",
    "La pratique courante empile la base de connaissances sur le RAG. Agent Pi DSH a choisi autrement pour répondre à une question : un PC de bureau ordinaire peut-il terminer le plus difficile des appels d'offres ?",
    "Üblich ist eine Wissensbasis auf RAG. Agent Pi DSH wählt bewusst einen anderen Weg: Kann ein normaler Büro-PC selbst die schwierigste Ausschreibung vollständig abschließen?",
    "一般的には知識ベースを RAG に積み上げます。Agent Pi DSH は「普通のオフィス PC で最難関の入札業務を最後まで完遂できるか」を軸に別の選択をしました。",
    "일반적으로 지식베이스를 RAG에 쌓습니다. Agent Pi DSH는 ‘일반 사무용 PC가 가장 어려운 입찰 업무를 끝까지 완수할 수 있는가’라는 질문에 맞춰 다른 선택을 했습니다.",
    "O padrão é colocar a base de conhecimento sobre RAG. O Agent Pi DSH escolheu outro caminho para responder: um PC comum consegue concluir a licitação mais difícil de ponta a ponta?",
    "المعتاد هو بناء قاعدة المعرفة فوق RAG. اختار Agent Pi DSH مساراً مختلفاً للإجابة: هل يستطيع حاسوب مكتبي عادي إنهاء أصعب عطاء من البداية للنهاية؟",
    "Обычно базу знаний строят поверх RAG. Agent Pi DSH выбрал иной путь ради одного вопроса: сможет ли обычный офисный ПК довести самый сложный тендер до конца?");
  add("Knowledge base without RAG: runs on any office PC", "Base de conocimiento sin RAG: funciona en cualquier PC", "Base de connaissances sans RAG : fonctionne sur tout PC", "Wissensbasis ohne RAG: läuft auf jedem Büro-PC", "RAG なしの知識ベース：通常の PC で動作", "RAG 없는 지식베이스: 일반 PC에서 실행", "Base de conhecimento sem RAG: funciona em qualquer PC", "قاعدة معرفة بلا RAG تعمل على أي حاسوب", "База знаний без RAG работает на любом ПК");
  add("A million tokens of context: the task never forgets", "Un millón de tokens de contexto: la tarea no olvida", "Un million de tokens de contexte : la mission n'oublie rien", "Eine Million Kontext-Token: Die Aufgabe vergisst nichts", "100万トークンのコンテキスト：タスクは忘れない", "100만 토큰 컨텍스트: 작업이 잊지 않습니다", "Um milhão de tokens de contexto: a tarefa não esquece", "مليون رمز سياق: المهمة لا تنسى", "Миллион токенов контекста: задача ничего не забывает");
  add("Why we swapped Claude SDK + Pi for DSH", "Por qué cambiamos Claude SDK + Pi por DSH", "Pourquoi nous avons remplacé Claude SDK + Pi par DSH", "Warum Claude SDK + Pi durch DSH ersetzt wurde", "Claude SDK + Pi から DSH に切り替えた理由", "Claude SDK + Pi에서 DSH로 전환한 이유", "Por que trocamos Claude SDK + Pi pelo DSH", "لماذا استبدلنا Claude SDK + Pi بـ DSH", "Почему мы заменили Claude SDK + Pi на DSH");
  add("Why Agent Pi", "Por qué Agent Pi", "Pourquoi Agent Pi", "Warum Agent Pi", "Agent Pi を選ぶ理由", "Agent Pi를 선택하는 이유", "Por que Agent Pi", "لماذا Agent Pi", "Почему Agent Pi");
  add("Not another chat assistant", "No es otro asistente de chat", "Pas un assistant de chat de plus", "Nicht noch ein Chat-Assistent", "単なるチャットアシスタントではない", "또 하나의 채팅 도우미가 아닙니다", "Não é apenas outro assistente de chat", "ليس مجرد مساعد محادثة آخر", "Не очередной чат-ассистент");
  add("General assistants like Doubao, Tongyi or WorkBuddy serve everyone's daily chores. Agent Pi DSH is built only for the heavy jobs of engineering enterprises — a different category from the ground up.",
    "Los asistentes generales cubren tareas cotidianas. Agent Pi DSH está creado para el trabajo pesado de las empresas de ingeniería: una categoría distinta desde la base.",
    "Les assistants généralistes couvrent le quotidien. Agent Pi DSH est conçu pour les travaux lourds des entreprises d'ingénierie : une autre catégorie dès l'origine.",
    "Allgemeine Assistenten erledigen Alltagsaufgaben. Agent Pi DSH ist für die anspruchsvolle Arbeit von Ingenieurunternehmen gebaut – von Grund auf eine andere Kategorie.",
    "汎用アシスタントは日常業務向けです。Agent Pi DSH はエンジニアリング企業の重い実務専用で、根本から別カテゴリの製品です。",
    "범용 도우미는 일상 업무용입니다. Agent Pi DSH는 엔지니어링 기업의 무거운 실무를 위해 설계된 근본적으로 다른 제품입니다.",
    "Assistentes gerais cuidam do cotidiano. O Agent Pi DSH foi criado para o trabalho pesado das empresas de engenharia — outra categoria desde a base.",
    "المساعدون العامون للمهام اليومية. صُمم Agent Pi DSH للأعمال الثقيلة في الشركات الهندسية، وهو فئة مختلفة من الأساس.",
    "Универсальные ассистенты решают бытовые задачи. Agent Pi DSH создан для тяжелой работы инженерных компаний — это другой класс продукта.");
  add("Dimension", "Dimensión", "Dimension", "Dimension", "比較軸", "비교 항목", "Dimensão", "البعد", "Критерий");
  add("Generic assistants (Doubao · Tongyi · WorkBuddy)", "Asistentes generales (Doubao · Tongyi · WorkBuddy)", "Assistants généralistes (Doubao · Tongyi · WorkBuddy)", "Allgemeine Assistenten (Doubao · Tongyi · WorkBuddy)", "汎用アシスタント（Doubao · Tongyi · WorkBuddy）", "범용 도우미(Doubao · Tongyi · WorkBuddy)", "Assistentes gerais (Doubao · Tongyi · WorkBuddy)", "مساعدون عامون (Doubao · Tongyi · WorkBuddy)", "Универсальные ассистенты (Doubao · Tongyi · WorkBuddy)");
  add("Task scale", "Escala de la tarea", "Échelle de la mission", "Aufgabenumfang", "タスク規模", "작업 규모", "Escala da tarefa", "حجم المهمة", "Масштаб задачи");
  add("Goal control", "Control del objetivo", "Contrôle de l'objectif", "Zielkontrolle", "目標制御", "목표 제어", "Controle do objetivo", "ضبط الهدف", "Контроль цели");
  add("Reliability", "Fiabilidad", "Fiabilité", "Zuverlässigkeit", "信頼性", "신뢰성", "Confiabilidade", "الموثوقية", "Надежность");
  add("Depth", "Profundidad", "Profondeur", "Fachtiefe", "専門性", "전문 깊이", "Profundidade", "العمق", "Глубина");
  add("Data volume", "Volumen de datos", "Volume de données", "Datenmenge", "データ量", "데이터 규모", "Volume de dados", "حجم البيانات", "Объем данных");
  add("Deliverable", "Entregable", "Livrable", "Ergebnis", "成果物", "결과물", "Entregável", "المخرج", "Результат");
  add("Loses the thread after a few dozen turns", "Pierde el hilo tras unas decenas de turnos", "Perd le fil après quelques dizaines d'échanges", "Verliert nach wenigen Dutzend Runden den Faden", "数十ターンで文脈と目標を失う", "수십 턴 뒤 맥락과 목표를 잃음", "Perde o fio após algumas dezenas de turnos", "يفقد السياق بعد عشرات الجولات", "Теряет нить после нескольких десятков ходов");
  add("Hour-long jobs finished in one run; crashes rescue only undelivered work", "Trabajos de horas en una ejecución; tras un fallo solo recupera lo no entregado", "Missions de plusieurs heures en une exécution ; seules les tâches non livrées sont reprises", "Stundenlange Aufgaben in einem Lauf; nach Absturz nur nicht gelieferte Arbeit fortsetzen", "時間単位の作業を一度で完遂し、障害時は未提出分だけ復旧", "시간 단위 작업을 한 번에 완료하고 장애 시 미제출분만 복구", "Trabalhos de horas em uma execução; após falha só recupera o que não foi entregue", "ينجز مهاماً لساعات في تشغيل واحد ويستعيد غير المسلّم فقط", "Многочасовая работа за один запуск; после сбоя восстанавливается только несданное");
  add("Drifts wherever the chat goes", "Se desvía con la conversación", "Dérive au fil de la conversation", "Driftet mit dem Gespräch", "会話に流されて目標がずれる", "대화 흐름에 따라 목표가 흔들림", "Desvia conforme a conversa", "ينحرف مع مسار المحادثة", "Уходит от цели вслед за диалогом");
  add("Stage gates and an output tree lock the goal — no drift", "Las puertas de etapa y el árbol de resultados fijan el objetivo", "Les portes d'étape et l'arbre de résultats verrouillent l'objectif", "Stage-Gates und Ergebnisbaum halten das Ziel fest", "段階ゲートと成果ツリーで目標を固定", "단계 게이트와 결과 트리로 목표 고정", "Portões de etapa e árvore de resultados fixam o objetivo", "بوابات المراحل وشجرة النتائج تثبت الهدف", "Этапные шлюзы и дерево результатов фиксируют цель");
  add("Fills gaps from model memory — hallucinations", "Rellena vacíos con memoria del modelo: alucinaciones", "Comble les lacunes par la mémoire du modèle : hallucinations", "Füllt Lücken aus Modellgedächtnis – Halluzinationen", "モデル記憶で欠落を補い、幻覚を生む", "모델 기억으로 빈틈을 채워 환각 발생", "Preenche lacunas com memória do modelo — alucinações", "يملأ الفجوات من ذاكرة النموذج فتظهر الهلوسة", "Заполняет пробелы памятью модели — галлюцинации");
  add("Evidence gates: no source, no pass — hallucinations fenced out", "Puertas de evidencia: sin fuente no hay avance", "Portes de preuve : sans source, pas de passage", "Beleg-Gates: Ohne Quelle kein Durchgang", "根拠がなければ通さない証拠ゲート", "출처 없이는 통과하지 않는 근거 게이트", "Portões de evidência: sem fonte, sem avanço", "بوابات الأدلة: لا عبور بلا مصدر", "Шлюзы доказательств: без источника нет прохода");
  add("Generic templates, no industry knowledge", "Plantillas genéricas sin conocimiento sectorial", "Modèles génériques sans connaissance métier", "Allgemeine Vorlagen ohne Branchenwissen", "業界知識のない汎用テンプレート", "산업 지식 없는 일반 템플릿", "Modelos genéricos sem conhecimento setorial", "قوالب عامة بلا معرفة قطاعية", "Общие шаблоны без отраслевых знаний");
  add("Vertical skills for tender / delivery / investment; specs and FIDIC clauses in the knowledge base", "Habilidades verticales para licitación, ejecución e inversión; normas y FIDIC en la base", "Compétences verticales pour appel d'offres, réalisation et investissement ; normes et FIDIC dans la base", "Vertikale Fähigkeiten für Ausschreibung, Ausführung und Investition; Normen und FIDIC in der Wissensbasis", "入札・施工・投資の専門スキルと仕様・FIDIC 条項の知識ベース", "입찰·수행·투자 전문 스킬과 규격·FIDIC 조항 지식베이스", "Competências verticais para licitação, entrega e investimento; normas e FIDIC na base", "مهارات متخصصة للعطاء والتنفيذ والاستثمار مع المواصفات وFIDIC في القاعدة", "Вертикальные навыки для тендеров, реализации и инвестиций; нормы и FIDIC в базе");
  add("Chokes on long documents, drops rows in big tables", "No maneja documentos largos y pierde filas en tablas grandes", "Bloque sur les longs documents et perd des lignes dans les grands tableaux", "Scheitert an langen Dokumenten und verliert Tabellenzeilen", "長文書を扱えず、大表で行を落とす", "긴 문서를 처리하지 못하고 큰 표에서 행 누락", "Falha em documentos longos e perde linhas em tabelas grandes", "يتعثر في المستندات الطويلة ويسقط صفوف الجداول", "Не справляется с длинными документами и теряет строки таблиц");
  add("Thousands of BOQ items processed line by line, each with its spec citation", "Miles de partidas BOQ procesadas una a una con su cita normativa", "Des milliers de postes BOQ traités ligne par ligne avec leur source", "Tausende BOQ-Positionen einzeln mit Normquelle verarbeitet", "数千の BOQ 項目を仕様出典付きで逐次処理", "수천 개 BOQ 항목을 규격 출처와 함께 항목별 처리", "Milhares de itens BOQ processados linha a linha com fonte normativa", "آلاف بنود BOQ تُعالج بنداً بنداً مع مرجع المواصفة", "Тысячи позиций BOQ обрабатываются построчно со ссылками на нормы");
  add("A chat transcript you reformat by hand", "Un chat que debe copiar y formatear", "Un dialogue à copier et remettre en forme", "Ein Chatprotokoll zum manuellen Formatieren", "手作業で整形するチャット記録", "수동 편집이 필요한 채팅 기록", "Um chat para copiar e formatar manualmente", "سجل محادثة يحتاج تنسيقاً يدوياً", "Чат, который нужно вручную оформлять");
  add("Official outputs on disk — polished layout, formula-carrying workbooks, citation chips; reusable into delivery after award", "Resultados oficiales guardados, con diseño pulido, fórmulas y citas; reutilizables tras la adjudicación", "Livrables officiels enregistrés, mise en page soignée, formules et sources ; réutilisables après attribution", "Formale Ergebnisse auf Datenträger, gutes Layout, Formeln und Quellen; nach Zuschlag weiterverwendbar", "整った体裁・数式・出典チップを備えた正式成果物を保存し、落札後も活用", "정돈된 서식·수식·출처 칩을 갖춘 공식 결과물을 저장하고 수주 후 재사용", "Resultados oficiais gravados, com layout, fórmulas e citações; reutilizáveis após a adjudicação", "نتائج رسمية محفوظة بتنسيق وصيغ ومراجع قابلة لإعادة الاستخدام بعد الترسية", "Официальные результаты на диске: оформление, формулы и источники; используются после победы");
  add("The tender flow", "Flujo de licitación", "Processus d'appel d'offres", "Ausschreibungsprozess", "入札プロセス", "입찰 프로세스", "Fluxo de licitação", "مسار العطاء", "Тендерный процесс");
  add("One long-horizon run, from tender documents to bid", "Una ejecución completa, del pliego a la oferta", "Une exécution longue, du dossier à l'offre", "Ein Durchlauf von den Ausschreibungsunterlagen zum Angebot", "入札書類から提出物までを一度の長期実行で", "입찰 문서부터 제출본까지 한 번의 장기 실행으로", "Uma execução longa, dos documentos à proposta", "تشغيل طويل واحد من مستندات العطاء إلى العرض", "Один длительный запуск: от тендерной документации до заявки");
  add("Take the tender module: this is what vertical depth means — every intermediate kept, every step checkable against its source.",
    "El módulo de licitación muestra la profundidad vertical: conserva cada material intermedio y permite comprobar cada paso contra su fuente.",
    "Le module d'appel d'offres illustre la profondeur métier : chaque intermédiaire est conservé et chaque étape vérifiable à la source.",
    "Das Ausschreibungsmodul zeigt vertikale Tiefe: Jeder Zwischenstand bleibt erhalten, jeder Schritt ist an seiner Quelle prüfbar.",
    "入札モジュールでは、すべての中間成果を保持し、各工程を原典と照合できます。これが業務特化の深さです。",
    "입찰 모듈은 모든 중간 결과를 보존하고 각 단계를 원문과 대조합니다. 이것이 버티컬 깊이입니다.",
    "O módulo de licitação mostra profundidade vertical: cada material intermediário é preservado e cada etapa pode ser conferida na fonte.",
    "تُظهر وحدة العطاء عمق التخصص: تُحفظ كل المواد الوسيطة ويمكن التحقق من كل خطوة مقابل مصدرها.",
    "Тендерный модуль показывает отраслевую глубину: все промежуточные материалы сохраняются, каждый шаг сверяется с источником.");
  add("Full tender parse, specs into the KB", "Análisis completo e incorporación de normas", "Analyse complète et normes dans la base", "Vollständige Analyse, Spezifikationen in der Wissensbasis", "入札書類を完全解析し仕様を知識化", "입찰 문서 전체 분석과 규격 지식화", "Análise completa e normas na base", "تحليل كامل وإدخال المواصفات إلى قاعدة المعرفة", "Полный разбор и нормы в базе знаний");
  add("Thousands of BOQ items, scope defined item by item", "Miles de partidas BOQ, alcance definido una a una", "Des milliers de postes BOQ, périmètre défini ligne par ligne", "Tausende BOQ-Positionen, Umfang einzeln definiert", "数千の BOQ 項目を一行ずつ範囲定義", "수천 개 BOQ 항목의 범위를 항목별 정의", "Milhares de itens BOQ, escopo definido item a item", "آلاف بنود BOQ مع تحديد النطاق بنداً بنداً", "Тысячи позиций BOQ с определением объема по каждой");
  add("Five-step derivation for every unit rate", "Derivación en cinco pasos para cada precio unitario", "Calcul en cinq étapes pour chaque prix unitaire", "Fünfstufige Herleitung jedes Einheitspreises", "各単価を5段階で導出", "모든 단가를 5단계로 산출", "Derivação em cinco etapas para cada preço unitário", "اشتقاق كل سعر وحدوي في خمس خطوات", "Пятиэтапный расчет каждой единичной расценки");
  add("Resource roll-up and cost estimation", "Consolidación de recursos y estimación de costes", "Consolidation des ressources et estimation des coûts", "Ressourcenaggregation und Kostenschätzung", "資源集計とコスト推定", "자원 집계와 원가 추정", "Consolidação de recursos e estimativa de custos", "تجميع الموارد وتقدير التكلفة", "Свод ресурсов и оценка стоимости");
  add("Construction simulation on project characteristics", "Simulación constructiva según el proyecto", "Simulation de construction selon le projet", "Bausimulation nach Projektmerkmalen", "プロジェクト特性に基づく施工シミュレーション", "프로젝트 특성 기반 시공 시뮬레이션", "Simulação construtiva conforme o projeto", "محاكاة التنفيذ وفق خصائص المشروع", "Моделирование строительства по особенностям проекта");
  add("The bid, written in your house style", "La oferta en el estilo de su empresa", "L'offre selon votre charte", "Das Angebot im Stil Ihres Unternehmens", "自社様式で正式な入札書を作成", "기업 양식에 맞춘 공식 입찰서", "A proposta no padrão da sua empresa", "إعداد العرض وفق أسلوب مؤسستك", "Заявка в корпоративном стиле");
  add("Capabilities", "Capacidades", "Capacités", "Funktionen", "主要機能", "핵심 기능", "Capacidades", "القدرات", "Возможности");
  add("Built for real jobs, not demo reels", "Creado para trabajo real, no para demostraciones", "Conçu pour le travail réel, pas pour les démos", "Für echte Arbeit gebaut, nicht für Demos", "デモではなく実務のために", "데모가 아닌 실제 업무를 위해", "Feito para trabalho real, não para demonstrações", "مصمم للعمل الحقيقي لا للعروض", "Создан для реальной работы, а не для демонстраций");
  add("The workbench accelerates, it does not gate: pick a workspace and talk. Heavy jobs fan out to native parallel workers, with evidence and outputs traceable end to end.",
    "El entorno acelera sin bloquear: elija un espacio y asigne la tarea. El trabajo pesado se reparte entre trabajadores paralelos, con evidencias y resultados trazables.",
    "L'atelier accélère sans bloquer : choisissez un espace et donnez la mission. Les travaux lourds sont distribués à des agents parallèles, avec preuves et résultats traçables.",
    "Die Arbeitsumgebung beschleunigt: Arbeitsbereich wählen und Aufgabe geben. Schwere Arbeit wird parallel verteilt, Belege und Ergebnisse bleiben nachvollziehbar.",
    "ワークベンチは入口を塞がず加速します。作業領域を選んで指示するだけで、重い処理は並列化され、根拠と成果を追跡できます。",
    "워크벤치는 진입을 막지 않고 가속합니다. 작업 공간을 선택해 지시하면 무거운 작업은 병렬 처리되고 근거와 결과를 추적할 수 있습니다.",
    "O ambiente acelera sem bloquear: escolha um espaço e dê a tarefa. O trabalho pesado é distribuído em paralelo, com evidências e resultados rastreáveis.",
    "تسرّع المنصة العمل دون تعقيد: اختر مساحة وأعط المهمة. تُوزع الأعمال الثقيلة بالتوازي مع تتبع الأدلة والنتائج.",
    "Рабочая среда ускоряет, а не мешает: выберите пространство и поставьте задачу. Тяжелая работа выполняется параллельно, доказательства и результаты прослеживаются.");
  add("Native parallel workers", "Trabajadores paralelos nativos", "Agents parallèles natifs", "Native parallele Worker", "ネイティブ並列ワーカー", "네이티브 병렬 워커", "Trabalhadores paralelos nativos", "عمال متوازون أصليون", "Нативные параллельные исполнители");
  add("ChatGPT sign-in · Codex subagent", "Inicio de sesión ChatGPT · subagente Codex", "Connexion ChatGPT · sous-agent Codex", "ChatGPT-Anmeldung · Codex-Subagent", "ChatGPT ログイン · Codex サブエージェント", "ChatGPT 로그인 · Codex 서브에이전트", "Login no ChatGPT · subagente Codex", "تسجيل ChatGPT · وكيل Codex فرعي", "Вход через ChatGPT · субагент Codex");
  add("Evidence gates", "Puertas de evidencia", "Portes de preuve", "Beleg-Gates", "根拠ゲート", "근거 게이트", "Portões de evidência", "بوابات الأدلة", "Шлюзы доказательств");
  add("Execution ledger · dual-state control", "Registro de ejecución · control de doble estado", "Registre d'exécution · contrôle à double état", "Ausführungsjournal · Zwei-Zustands-Kontrolle", "実行台帳 · 二重状態制御", "실행 원장 · 이중 상태 제어", "Registro de execução · controle de estado duplo", "سجل التنفيذ · تحكم ثنائي الحالة", "Журнал выполнения · двухсостоянийный контроль");
  add("Clickable citation chips", "Chips de cita interactivos", "Puce de source cliquable", "Anklickbare Quellen-Chips", "クリック可能な出典チップ", "클릭 가능한 출처 칩", "Chips de citação clicáveis", "شرائح مراجع قابلة للنقر", "Кликабельные метки источников");
  add("Tender execution hardened", "Ejecución de licitación reforzada", "Exécution d'appel d'offres renforcée", "Robuste Ausschreibungsausführung", "強化された入札実行チェーン", "강화된 입찰 실행 체계", "Execução de licitação reforçada", "تنفيذ عطاء محكم", "Усиленное выполнение тендера");
  add("Local knowledge base", "Base de conocimiento local", "Base de connaissances locale", "Lokale Wissensbasis", "ローカル知識ベース", "로컬 지식베이스", "Base de conhecimento local", "قاعدة معرفة محلية", "Локальная база знаний");
  add("Crash-smart recovery", "Recuperación inteligente tras fallos", "Reprise intelligente après incident", "Intelligente Wiederherstellung", "クラッシュ後のスマート復旧", "충돌 후 스마트 복구", "Recuperação inteligente após falha", "استعادة ذكية بعد التعطل", "Умное восстановление после сбоя");
  add("Enterprise plugins", "Plugins empresariales", "Plugins d'entreprise", "Unternehmens-Plugins", "エンタープライズプラグイン", "엔터프라이즈 플러그인", "Plugins empresariais", "إضافات مؤسسية", "Корпоративные плагины");
  add("Official vision pipe", "Canal visual oficial", "Canal de vision officiel", "Offizielle Vision-Pipeline", "公式ビジョンパイプライン", "공식 비전 파이프라인", "Canal visual oficial", "مسار الرؤية الرسمي", "Официальный визуальный конвейер");
  add("One-sentence module distillation", "Destilación del módulo en una frase", "Distillation du module en une phrase", "Moduldestillation in einem Satz", "一文で業務モジュールを蒸留", "한 문장 도메인 모듈 증류", "Destilação do módulo em uma frase", "استخلاص الوحدة في جملة", "Дистилляция модуля в одном предложении");
  add("DeepSeek Harness is the engine. Agent Pi is the workbench.", "DeepSeek Harness es el motor. Agent Pi es el entorno de trabajo.", "DeepSeek Harness est le moteur. Agent Pi est l'atelier.", "DeepSeek Harness ist der Motor. Agent Pi ist die Arbeitsumgebung.", "DeepSeek Harness がエンジン、Agent Pi がワークベンチです。", "DeepSeek Harness는 엔진, Agent Pi는 워크벤치입니다.", "DeepSeek Harness é o motor. Agent Pi é o ambiente de trabalho.", "DeepSeek Harness هو المحرك وAgent Pi هو منصة العمل.", "DeepSeek Harness — двигатель. Agent Pi — рабочая среда.");
  add("Domains", "Áreas", "Domaines", "Bereiche", "業務領域", "업무 영역", "Domínios", "المجالات", "Области");
  add("Three domains, one workbench", "Tres áreas, un solo entorno", "Trois domaines, un seul atelier", "Drei Bereiche, eine Arbeitsumgebung", "3つの業務領域を1つのワークベンチで", "세 가지 영역, 하나의 워크벤치", "Três domínios, um ambiente", "ثلاثة مجالات في منصة واحدة", "Три области, одна рабочая среда");
  add("Tender", "Licitación", "Appels d'offres", "Ausschreibung", "入札", "입찰", "Licitação", "العطاء", "Тендеры");
  add("Delivery", "Ejecución", "Réalisation", "Ausführung", "施工・実施", "수행", "Entrega", "التنفيذ", "Реализация");
  add("Investment", "Inversión", "Investissement", "Investition", "投資", "투자", "Investimento", "الاستثمار", "Инвестиции");
  add("Bid parse and pricing, from tender documents to a submittable bid.", "Análisis y precios desde los pliegos hasta una oferta presentable.", "Analyse et prix, du dossier à une offre soumissible.", "Analyse und Kalkulation von den Unterlagen bis zum einreichbaren Angebot.", "入札書類の解析・積算から提出可能な入札書まで。", "입찰 문서 분석·가격 산정부터 제출 가능한 입찰서까지.", "Análise e preços dos documentos até uma proposta apresentável.", "تحليل وتسعير من المستندات إلى عرض جاهز للتقديم.", "Разбор и расчет: от документов до готовой заявки.");
  add("Delivery planning and project controls, outputs on disk and traceable.", "Planificación y control del proyecto con resultados guardados y trazables.", "Planification et contrôle du projet, avec livrables enregistrés et traçables.", "Ausführungsplanung und Projektsteuerung mit nachvollziehbaren Ergebnissen.", "施工計画とプロジェクト管理、成果を保存し追跡可能に。", "수행 계획과 프로젝트 통제, 결과물을 저장하고 추적 가능하게.", "Planejamento e controle do projeto com resultados gravados e rastreáveis.", "تخطيط التنفيذ وضبط المشروع مع نتائج محفوظة وقابلة للتتبع.", "Планирование и контроль проекта с сохраняемыми и прослеживаемыми результатами.");
  add("Intelligence, diligence and transaction decisions for resource investment.", "Inteligencia, diligencia y decisiones para inversiones en recursos.", "Veille, due diligence et décisions pour l'investissement en ressources.", "Information, Due Diligence und Transaktionsentscheidungen für Ressourceninvestitionen.", "資源投資の情報収集・デューデリジェンス・取引判断。", "자원 투자의 정보·실사·거래 의사결정.", "Inteligência, diligência e decisões para investimento em recursos.", "معلومات وعناية واجبة وقرارات صفقات لاستثمار الموارد.", "Аналитика, проверка и решения по инвестициям в ресурсы.");
  add("Knowledge Base · 3.3.2", "Base de conocimiento · 3.3.2", "Base de connaissances · 3.3.2", "Wissensbasis · 3.3.2", "知識ベース · 3.3.2", "지식베이스 · 3.3.2", "Base de conhecimento · 3.3.2", "قاعدة المعرفة · 3.3.2", "База знаний · 3.3.2");
  add("Turn project experience into a searchable asset", "Convierta la experiencia del proyecto en un activo consultable", "Transformez l'expérience projet en actif interrogeable", "Projekterfahrung als durchsuchbares Gut", "プロジェクト経験を検索可能な資産へ", "프로젝트 경험을 검색 가능한 자산으로", "Transforme a experiência do projeto em um ativo pesquisável", "حوّل خبرة المشروع إلى أصل قابل للبحث", "Превратите опыт проекта в доступный для поиска актив");
  add("Ecosystem", "Ecosistema", "Écosystème", "Ökosystem", "エコシステム", "생태계", "Ecossistema", "المنظومة", "Экосистема");
  add("A plugin market, and your own assembly", "Un mercado de plugins y su propio conjunto", "Un marché de plugins et votre propre assemblage", "Plugin-Markt und eigene Zusammenstellung", "プラグイン市場と自社構成", "플러그인 마켓과 맞춤 구성", "Um mercado de plugins e sua própria composição", "سوق إضافات وتجميعك الخاص", "Магазин плагинов и собственная сборка");
  add("From real jobs", "De proyectos reales", "Issu de projets réels", "Aus echten Projekten", "実プロジェクトから", "실제 프로젝트에서", "De projetos reais", "من أعمال حقيقية", "Из реальных проектов");
  add("Outputs the agent actually produced", "Resultados realmente producidos por el agente", "Résultats réellement produits par l'agent", "Vom Agenten tatsächlich erzeugte Ergebnisse", "エージェントが実際に作成した成果", "에이전트가 실제로 만든 결과물", "Resultados realmente produzidos pelo agente", "نتائج أنشأها الوكيل فعلياً", "Результаты, реально созданные агентом");
  add("Next stop · enterprise", "Siguiente paso · empresa", "Prochaine étape · entreprise", "Nächster Schritt · Unternehmen", "次の段階 · エンタープライズ", "다음 단계 · 엔터프라이즈", "Próximo passo · empresa", "الخطوة التالية · المؤسسة", "Следующий этап · предприятие");
  add("Private deployment: Agent Pi on your own servers", "Despliegue privado: Agent Pi en sus servidores", "Déploiement privé : Agent Pi sur vos serveurs", "Private Bereitstellung: Agent Pi auf eigenen Servern", "プライベート導入：自社サーバー上の Agent Pi", "프라이빗 배포: 자체 서버의 Agent Pi", "Implantação privada: Agent Pi nos seus servidores", "نشر خاص: Agent Pi على خوادمك", "Частное развертывание: Agent Pi на ваших серверах");
  add("Direction", "Dirección", "Orientation", "Richtung", "方向性", "방향", "Direção", "الاتجاه", "Направление");
  add("Server-hosted Web, multi-user", "Web en servidor, multiusuario", "Web hébergé sur serveur, multi-utilisateur", "Server-gehostetes Web, mehrere Benutzer", "サーバー型 Web・マルチユーザー", "서버 호스팅 Web·다중 사용자", "Web hospedada no servidor, multiusuário", "ويب مستضاف على الخادم ومتعدد المستخدمين", "Серверная Web-версия, многопользовательская");
  add("IM bus: WeChat / Feishu / DingTalk / QQ", "Bus IM: WeChat / Feishu / DingTalk / QQ", "Bus de messagerie : WeChat / Feishu / DingTalk / QQ", "IM-Bus: WeChat / Feishu / DingTalk / QQ", "IM バス：WeChat / Feishu / DingTalk / QQ", "IM 버스: WeChat / Feishu / DingTalk / QQ", "Barramento IM: WeChat / Feishu / DingTalk / QQ", "ناقل المراسلة: WeChat / Feishu / DingTalk / QQ", "Шина IM: WeChat / Feishu / DingTalk / QQ");
  add("OA process plugins, always on", "Plugins de procesos OA siempre activos", "Plugins de processus OA toujours actifs", "Ständig aktive OA-Prozess-Plugins", "常駐 OA プロセスプラグイン", "상시 운영 OA 프로세스 플러그인", "Plugins de processos OA sempre ativos", "إضافات عمليات OA تعمل دائماً", "Постоянно работающие плагины OA-процессов");
  add("Private model stack, data in-house", "Pila de modelos privada, datos internos", "Pile de modèles privée, données en interne", "Privater Modell-Stack, Daten im Haus", "プライベートモデルスタック・データは社内に", "프라이빗 모델 스택·데이터 사내 유지", "Pilha de modelos privada, dados internos", "حزمة نماذج خاصة والبيانات داخل المؤسسة", "Частный стек моделей, данные внутри компании");
  add("The leap from digitization to intelligence can start with one server", "El salto a la inteligencia puede empezar con un servidor", "Le passage à l'intelligence peut commencer avec un serveur", "Der Sprung zur Intelligenz kann mit einem Server beginnen", "デジタル化から知能化へ、1台のサーバーから", "디지털화에서 지능화로, 서버 한 대에서 시작", "O salto para a inteligência pode começar com um servidor", "يمكن بدء الانتقال إلى الذكاء بخادم واحد", "Переход к интеллекту можно начать с одного сервера");
  add("Plan", "Plan", "Offre", "Plan", "プラン", "구성", "Plano", "الخطة", "Вариант");
  add("What you need", "Equipo necesario", "Équipement requis", "Benötigte Ausstattung", "必要な設備", "필요 장비", "Equipamento necessário", "المعدات المطلوبة", "Необходимое оборудование");
  add("Cost (one-time)", "Coste (único)", "Coût (ponctuel)", "Kosten (einmalig)", "費用（一括）", "비용(일회성)", "Custo (único)", "التكلفة (مرة واحدة)", "Стоимость (разово)");
  add("Starter 10–20 people", "Inicial<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 personas</small>", "Démarrage<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 personnes</small>", "Starter<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 Personen</small>", "スターター<br><small style=\"font-weight:400;color:var(--text-faint)\">10～20人</small>", "시작형<br><small style=\"font-weight:400;color:var(--text-faint)\">10~20명</small>", "Inicial<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 pessoas</small>", "بداية<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 شخصاً</small>", "Начальный<br><small style=\"font-weight:400;color:var(--text-faint)\">10–20 человек</small>");
  add("Standard 30–80 people", "Estándar<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 personas</small>", "Standard<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 personnes</small>", "Standard<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 Personen</small>", "標準<br><small style=\"font-weight:400;color:var(--text-faint)\">30～80人</small>", "표준형<br><small style=\"font-weight:400;color:var(--text-faint)\">30~80명</small>", "Padrão<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 pessoas</small>", "قياسي<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 شخصاً</small>", "Стандартный<br><small style=\"font-weight:400;color:var(--text-faint)\">30–80 человек</small>");
  add("Software", "Software", "Logiciel", "Software", "ソフトウェア", "소프트웨어", "Software", "البرمجيات", "ПО");
  add("Network", "Red", "Réseau", "Netzwerk", "ネットワーク", "네트워크", "Rede", "الشبكة", "Сеть");
  add("Roadmap", "Hoja de ruta", "Feuille de route", "Roadmap", "ロードマップ", "로드맵", "Roteiro", "خارطة الطريق", "План развития");
  add("Deeper into infrastructure", "Más profundidad en infraestructura", "Plus loin dans les infrastructures", "Tiefer in die Infrastruktur", "インフラ分野をさらに深く", "인프라 분야를 더 깊게", "Mais profundidade em infraestrutura", "تعمق أكبر في البنية التحتية", "Глубже в инфраструктуру");
  add("In progress", "En curso", "En cours", "In Arbeit", "進行中", "진행 중", "Em andamento", "قيد التنفيذ", "В работе");
  add("Planned", "Planificado", "Prévu", "Geplant", "計画中", "계획 중", "Planejado", "مخطط", "Запланировано");
  add("Quantity takeoff from PDF drawings", "Medición desde planos PDF", "Métré à partir de plans PDF", "Mengenermittlung aus PDF-Plänen", "PDF 図面からの数量算出", "PDF 도면 물량 산출", "Levantamento de quantidades em desenhos PDF", "حصر الكميات من رسومات PDF", "Подсчет объемов по PDF-чертежам");
  add("Architectural concept imagery", "Imágenes conceptuales de arquitectura", "Images conceptuelles architecturales", "Architektonische Konzeptbilder", "建築コンセプト画像", "건축 콘셉트 이미지", "Imagens conceituais de arquitetura", "صور المفاهيم المعمارية", "Архитектурные концепт-изображения");
  add("3D modeling", "Modelado 3D", "Modélisation 3D", "3D-Modellierung", "3D モデリング", "3D 모델링", "Modelagem 3D", "النمذجة ثلاثية الأبعاد", "3D-моделирование");

  /* Download panel and footer. */
  add("Get started", "Comenzar", "Commencer", "Loslegen", "始める", "시작하기", "Começar", "ابدأ", "Начать");
  add("Open a project. Give it the job.", "Abra un proyecto. Asigne la tarea.", "Ouvrez un projet. Donnez-lui la mission.", "Projekt öffnen. Aufgabe erteilen.", "プロジェクトを開き、仕事を任せる。", "프로젝트를 열고 작업을 맡기세요.", "Abra um projeto. Dê a tarefa.", "افتح مشروعاً وأسند إليه المهمة.", "Откройте проект и поставьте задачу.");
  add("Download {{data-release-version}} for Windows, macOS or Linux from GitHub; then pick a workspace and connect DeepSeek, or sign in to Codex with ChatGPT.",
    "Descargue <span data-release-version>3.5.2</span> para Windows, macOS o Linux desde GitHub; elija un espacio de trabajo y conecte DeepSeek, o inicie sesión en Codex con ChatGPT.",
    "Téléchargez la version <span data-release-version>3.5.2</span> pour Windows, macOS ou Linux depuis GitHub ; choisissez un espace et connectez DeepSeek, ou ouvrez une session Codex avec ChatGPT.",
    "Laden Sie <span data-release-version>3.5.2</span> für Windows, macOS oder Linux von GitHub herunter; wählen Sie einen Arbeitsbereich und verbinden Sie DeepSeek oder melden Sie sich mit ChatGPT bei Codex an.",
    "GitHub から Windows・macOS・Linux 用 <span data-release-version>3.5.2</span> を取得し、作業領域と DeepSeek を設定するか、ChatGPT で Codex にログインします。",
    "GitHub에서 Windows, macOS 또는 Linux용 <span data-release-version>3.5.2</span>를 내려받고 작업 공간과 DeepSeek를 설정하거나 ChatGPT로 Codex에 로그인하세요.",
    "Baixe a versão <span data-release-version>3.5.2</span> para Windows, macOS ou Linux no GitHub; escolha um espaço e conecte o DeepSeek, ou entre no Codex com o ChatGPT.",
    "نزّل الإصدار <span data-release-version>3.5.2</span> لويندوز أو macOS أو Linux من GitHub، ثم اختر مساحة عمل ووصل DeepSeek أو سجّل الدخول إلى Codex عبر ChatGPT.",
    "Скачайте версию <span data-release-version>3.5.2</span> для Windows, macOS или Linux с GitHub; выберите рабочее пространство и подключите DeepSeek либо войдите в Codex через ChatGPT.");
  add("GitHub latest release", "Última versión en GitHub", "Dernière version GitHub", "Neueste GitHub-Version", "GitHub 最新リリース", "GitHub 최신 릴리스", "Versão mais recente no GitHub", "أحدث إصدار على GitHub", "Последний выпуск GitHub");
  add("Released {{data-release-date}}", "Publicado el <span data-release-date>2026-08-31</span>", "Publié le <span data-release-date>2026-08-31</span>", "Veröffentlicht am <span data-release-date>2026-08-31</span>", "公開日 <span data-release-date>2026-08-31</span>", "출시일 <span data-release-date>2026-08-31</span>", "Publicado em <span data-release-date>2026-08-31</span>", "نُشر في <span data-release-date>2026-08-31</span>", "Опубликовано <span data-release-date>2026-08-31</span>");
  add("Download EXE", "Descargar EXE", "Télécharger EXE", "EXE herunterladen", "EXE をダウンロード", "EXE 다운로드", "Baixar EXE", "تنزيل EXE", "Скачать EXE");
  add("Download DMG", "Descargar DMG", "Télécharger DMG", "DMG herunterladen", "DMG をダウンロード", "DMG 다운로드", "Baixar DMG", "تنزيل DMG", "Скачать DMG");
  add("Download AppImage", "Descargar AppImage", "Télécharger AppImage", "AppImage herunterladen", "AppImage をダウンロード", "AppImage 다운로드", "Baixar AppImage", "تنزيل AppImage", "Скачать AppImage");
  add("The page syncs a complete GitHub Latest Release when opened; if the API is temporarily unavailable, it uses the verified fallback links embedded in the page.",
    "Al abrirse, la página sincroniza la versión completa más reciente de GitHub; si la API no está disponible, utiliza los enlaces de respaldo verificados.",
    "À l'ouverture, la page synchronise la dernière version GitHub complète ; si l'API est indisponible, elle utilise les liens de secours vérifiés.",
    "Beim Öffnen synchronisiert die Seite die vollständige neueste GitHub-Version; ist die API nicht erreichbar, gelten die geprüften Ersatzlinks.",
    "ページ表示時に GitHub の完全な最新リリースと同期します。API が一時的に利用できない場合は、検証済みの予備リンクを使用します。",
    "페이지를 열면 GitHub의 완전한 최신 릴리스와 동기화합니다. API를 사용할 수 없으면 검증된 예비 링크를 사용합니다.",
    "Ao abrir, a página sincroniza a versão completa mais recente do GitHub; se a API estiver indisponível, usa os links de contingência verificados.",
    "تزامن الصفحة أحدث إصدار كامل من GitHub عند فتحها؛ وإذا تعذرت الواجهة تستخدم روابط احتياطية موثقة.",
    "При открытии страница синхронизирует полный последний выпуск GitHub; если API недоступен, используются проверенные резервные ссылки.");
  add("Windows SHA256: {{data-release-sha}}",
    "SHA256 de Windows: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "SHA256 Windows : <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "Windows-SHA256: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "Windows SHA256：<code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "Windows SHA256: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "SHA256 do Windows: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "SHA256 لويندوز: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>",
    "SHA256 Windows: <code data-release-sha>664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A</code>");
  add("Current builds are unsigned or unnotarized · On Windows choose SmartScreen → “Run anyway” · Quit fully before upgrading · Verify the Windows SHA256 before installation",
    "Las compilaciones actuales no están firmadas · En Windows elija SmartScreen → «Ejecutar de todos modos» · Cierre completamente antes de actualizar · Verifique SHA256",
    "Les builds actuels ne sont pas signés · Sous Windows choisissez SmartScreen → « Exécuter quand même » · Quittez complètement avant la mise à niveau · Vérifiez le SHA256",
    "Aktuelle Builds sind nicht signiert · Unter Windows SmartScreen → „Trotzdem ausführen“ wählen · Vor dem Upgrade vollständig beenden · SHA256 prüfen",
    "現在のビルドは未署名です · Windows では SmartScreen の「実行」を選択 · 更新前に完全終了 · インストール前に SHA256 を確認",
    "현재 빌드는 서명되지 않았습니다 · Windows에서 SmartScreen → ‘실행’ 선택 · 업그레이드 전 완전 종료 · 설치 전 SHA256 확인",
    "As versões atuais não são assinadas · No Windows escolha SmartScreen → “Executar assim mesmo” · Feche totalmente antes de atualizar · Verifique o SHA256",
    "الإصدارات الحالية غير موقعة · في Windows اختر SmartScreen ← «تشغيل على أي حال» · أغلق التطبيق تماماً قبل الترقية · تحقق من SHA256",
    "Текущие сборки не подписаны · В Windows выберите SmartScreen → «Выполнить в любом случае» · Полностью закройте приложение перед обновлением · Проверьте SHA256");
  add("The vertical agent for engineering firms: tender, delivery, investment — long-horizon jobs in one run. Always π AI Studio.",
    "El agente vertical para empresas de ingeniería: licitación, ejecución e inversión en una sola ejecución. Always π AI Studio.",
    "L'agent vertical des entreprises d'ingénierie : appels d'offres, réalisation et investissement en une seule exécution. Always π AI Studio.",
    "Der vertikale Agent für Ingenieurunternehmen: Ausschreibung, Ausführung und Investition in einem Durchlauf. Always π AI Studio.",
    "エンジニアリング企業向け垂直型エージェント：入札・施工・投資を一度の実行で。Always π AI Studio。",
    "엔지니어링 기업용 버티컬 에이전트: 입찰·수행·투자를 한 번의 실행으로. Always π AI Studio.",
    "O agente vertical para empresas de engenharia: licitação, entrega e investimento em uma só execução. Always π AI Studio.",
    "الوكيل المتخصص لشركات الهندسة: العطاء والتنفيذ والاستثمار في تشغيل واحد. Always π AI Studio.",
    "Вертикальный агент для инженерных компаний: тендеры, реализация и инвестиции за один запуск. Always π AI Studio.");
  add("Product", "Producto", "Produit", "Produkt", "製品", "제품", "Produto", "المنتج", "Продукт");
  add("Features", "Funciones", "Fonctions", "Funktionen", "機能", "기능", "Recursos", "الوظائف", "Функции");
  add("Download", "Descargar", "Télécharger", "Download", "ダウンロード", "다운로드", "Baixar", "التنزيل", "Скачать");
  add("Resources", "Recursos", "Ressources", "Ressourcen", "リソース", "리소스", "Recursos", "الموارد", "Ресурсы");
  add("Version notes", "Notas de versión", "Notes de version", "Versionshinweise", "リリースノート", "버전 정보", "Notas da versão", "ملاحظات الإصدار", "Примечания к версии");
  add("Privacy", "Privacidad", "Confidentialité", "Datenschutz", "プライバシー", "개인정보 보호", "Privacidade", "الخصوصية", "Конфиденциальность");
  add("Code signing", "Firma de código", "Signature du code", "Codesignatur", "コード署名", "코드 서명", "Assinatura de código", "توقيع الشفرة", "Подпись кода");
  add("Versions", "Versiones", "Versions", "Versionen", "バージョン", "버전", "Versões", "الإصدارات", "Версии");

  var titles = {
    "zh-CN": "Agent Pi DSH — 工程企业的垂直智能体：投标、实施、投资",
    en: "Agent Pi DSH — The vertical agent for engineering enterprises",
    es: "Agent Pi DSH — El agente vertical para empresas de ingeniería",
    fr: "Agent Pi DSH — L'agent vertical des entreprises d'ingénierie",
    de: "Agent Pi DSH — Der vertikale Agent für Ingenieurunternehmen",
    ja: "Agent Pi DSH — エンジニアリング企業向け垂直型エージェント",
    ko: "Agent Pi DSH — 엔지니어링 기업용 버티컬 에이전트",
    pt: "Agent Pi DSH — O agente vertical para empresas de engenharia",
    ar: "Agent Pi DSH — الوكيل المتخصص لشركات الهندسة",
    ru: "Agent Pi DSH — Вертикальный агент для инженерных компаний"
  };

  function normaliseText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  var LIVE_ATTRIBUTES = ["data-rel-version", "data-release-version", "data-release-date", "data-release-sha", "data-kernel-version"];

  function translationKey(node) {
    var clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach(function (br) { br.replaceWith(" "); });
    LIVE_ATTRIBUTES.forEach(function (attribute) {
      clone.querySelectorAll("[" + attribute + "]").forEach(function (liveNode) {
        liveNode.replaceWith(" {{" + attribute + "}} ");
      });
    });
    return normaliseText(clone.textContent);
  }

  function liveValues(node) {
    var values = Object.create(null);
    LIVE_ATTRIBUTES.forEach(function (attribute) {
      values[attribute] = Array.prototype.map.call(node.querySelectorAll("[" + attribute + "]"), function (liveNode) {
        return liveNode.textContent;
      });
    });
    return values;
  }

  function setTranslatedHtml(node, html) {
    var values = liveValues(node);
    node.innerHTML = html;
    LIVE_ATTRIBUTES.forEach(function (attribute) {
      node.querySelectorAll("[" + attribute + "]").forEach(function (liveNode, index) {
        if (values[attribute] && values[attribute][index] != null) liveNode.textContent = values[attribute][index];
      });
    });
  }

  function normaliseLocale(value) {
    var raw = String(value || "").trim().replace(/_/g, "-");
    var lower = raw.toLowerCase();
    if (lower === "zh" || lower.indexOf("zh-") === 0) return "zh-CN";
    var base = lower.split("-")[0];
    return LOCALES.indexOf(base) >= 0 ? base : null;
  }

  function browserLocale() {
    var candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
    for (var i = 0; i < candidates.length; i += 1) {
      var locale = normaliseLocale(candidates[i]);
      if (locale) return locale;
    }
    return "en";
  }

  var authoredNodes = [];
  function collectAuthoredNodes() {
    if (authoredNodes.length) return;
    document.querySelectorAll('body [data-lang="en"]').forEach(function (node) {
      authoredNodes.push({
        node: node,
        source: translationKey(node),
        html: node.innerHTML
      });
    });
  }

  function apply(locale) {
    locale = normaliseLocale(locale) || "en";
    collectAuthoredNodes();
    var translatedCount = 0;
    var failureCount = 0;
    authoredNodes.forEach(function (entry) {
      if (!entry.node.isConnected) return;
      try {
        setTranslatedHtml(entry.node, entry.html);
        if (locale === "zh-CN" || locale === "en") return;
        var translated = phrases[entry.source] && phrases[entry.source][locale];
        if (translated) {
          setTranslatedHtml(entry.node, translated);
          translatedCount += 1;
        }
      } catch (error) {
        failureCount += 1;
      }
    });
    document.title = titles[locale] || titles.en;
    document.documentElement.setAttribute("data-i18n-ready", "true");
    document.documentElement.setAttribute("data-i18n-translated", String(translatedCount));
    document.documentElement.setAttribute("data-i18n-failures", String(failureCount));
    var select = document.querySelector("[data-language-select]");
    if (select && select.value !== locale) select.value = locale;
    return locale;
  }

  function initialLocale(stored) {
    return normaliseLocale(stored) || browserLocale();
  }

  window.AgentPiI18n = {
    locales: LOCALES.slice(),
    languageNames: LANGUAGE_NAMES,
    normaliseLocale: normaliseLocale,
    initialLocale: initialLocale,
    apply: apply,
    translatedPhraseCount: Object.keys(phrases).length
  };
})();
