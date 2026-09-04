import type { Language } from '../../electron/shared'

interface MermaidGuideLabels {
  more: string
  description: string
  gantt: string
  classDiagram: string
  state: string
  entityRelationship: string
  journey: string
  git: string
  mindmap: string
  timeline: string
  quadrant: string
  sankey: string
  xy: string
  requirement: string
  block: string
  c4: string
}

const LABELS: Record<Language, MermaidGuideLabels> = {
  en: {
    more: 'More Mermaid examples', description: 'The installed Mermaid version also supports these diagram types.',
    gantt: 'Gantt chart', classDiagram: 'Class diagram', state: 'State diagram', entityRelationship: 'Entity relationship diagram',
    journey: 'User journey', git: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', quadrant: 'Quadrant chart',
    sankey: 'Sankey diagram', xy: 'XY chart', requirement: 'Requirement diagram', block: 'Block diagram', c4: 'C4 context diagram'
  },
  'en-GB': {
    more: 'More Mermaid examples', description: 'The installed Mermaid version also supports these diagram types.',
    gantt: 'Gantt chart', classDiagram: 'Class diagram', state: 'State diagram', entityRelationship: 'Entity relationship diagram',
    journey: 'User journey', git: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', quadrant: 'Quadrant chart',
    sankey: 'Sankey diagram', xy: 'XY chart', requirement: 'Requirement diagram', block: 'Block diagram', c4: 'C4 context diagram'
  },
  'pt-BR': {
    more: 'Outros exemplos Mermaid', description: 'A versão Mermaid instalada também suporta estes tipos de diagrama.',
    gantt: 'Gráfico de Gantt', classDiagram: 'Diagrama de classes', state: 'Diagrama de estados', entityRelationship: 'Diagrama entidade-relacionamento',
    journey: 'Jornada do usuário', git: 'Gráfico Git', mindmap: 'Mapa mental', timeline: 'Linha do tempo', quadrant: 'Gráfico de quadrantes',
    sankey: 'Diagrama Sankey', xy: 'Gráfico XY', requirement: 'Diagrama de requisitos', block: 'Diagrama de blocos', c4: 'Diagrama de contexto C4'
  },
  'pt-PT': {
    more: 'Mais exemplos Mermaid', description: 'A versão instalada do Mermaid também suporta estes tipos de diagramas.',
    gantt: 'Gráfico de Gantt', classDiagram: 'Diagrama de classes', state: 'Diagrama de estados', entityRelationship: 'Diagrama entidade-relação',
    journey: 'Percurso do utilizador', git: 'Grafo Git', mindmap: 'Mapa mental', timeline: 'Cronologia', quadrant: 'Gráfico de quadrantes',
    sankey: 'Diagrama de Sankey', xy: 'Gráfico XY', requirement: 'Diagrama de requisitos', block: 'Diagrama de blocos', c4: 'Diagrama de contexto C4'
  },
  es: {
    more: 'Más ejemplos de Mermaid', description: 'La versión instalada de Mermaid también admite estos tipos de diagramas.',
    gantt: 'Diagrama de Gantt', classDiagram: 'Diagrama de clases', state: 'Diagrama de estados', entityRelationship: 'Diagrama entidad-relación',
    journey: 'Viaje del usuario', git: 'Gráfico Git', mindmap: 'Mapa mental', timeline: 'Línea de tiempo', quadrant: 'Gráfico de cuadrantes',
    sankey: 'Diagrama Sankey', xy: 'Gráfico XY', requirement: 'Diagrama de requisitos', block: 'Diagrama de bloques', c4: 'Diagrama de contexto C4'
  },
  fr: {
    more: 'Autres exemples Mermaid', description: 'La version installée de Mermaid prend également en charge ces types de diagrammes.',
    gantt: 'Diagramme de Gantt', classDiagram: 'Diagramme de classes', state: 'Diagramme d’état', entityRelationship: 'Diagramme entité-association',
    journey: 'Parcours utilisateur', git: 'Graphe Git', mindmap: 'Carte mentale', timeline: 'Chronologie', quadrant: 'Graphique à quadrants',
    sankey: 'Diagramme de Sankey', xy: 'Graphique XY', requirement: 'Diagramme d’exigences', block: 'Diagramme de blocs', c4: 'Diagramme de contexte C4'
  },
  de: {
    more: 'Weitere Mermaid-Beispiele', description: 'Die installierte Mermaid-Version unterstützt außerdem diese Diagrammtypen.',
    gantt: 'Gantt-Diagramm', classDiagram: 'Klassendiagramm', state: 'Zustandsdiagramm', entityRelationship: 'Entitäts-Beziehungs-Diagramm',
    journey: 'Benutzerreise', git: 'Git-Graph', mindmap: 'Mindmap', timeline: 'Zeitleiste', quadrant: 'Quadrantendiagramm',
    sankey: 'Sankey-Diagramm', xy: 'XY-Diagramm', requirement: 'Anforderungsdiagramm', block: 'Blockdiagramm', c4: 'C4-Kontextdiagramm'
  },
  it: {
    more: 'Altri esempi Mermaid', description: 'La versione installata di Mermaid supporta anche questi tipi di diagrammi.',
    gantt: 'Diagramma di Gantt', classDiagram: 'Diagramma delle classi', state: 'Diagramma degli stati', entityRelationship: 'Diagramma entità-relazione',
    journey: 'Percorso utente', git: 'Grafo Git', mindmap: 'Mappa mentale', timeline: 'Cronologia', quadrant: 'Grafico a quadranti',
    sankey: 'Diagramma di Sankey', xy: 'Grafico XY', requirement: 'Diagramma dei requisiti', block: 'Diagramma a blocchi', c4: 'Diagramma di contesto C4'
  },
  nl: {
    more: 'Meer Mermaid-voorbeelden', description: 'De geïnstalleerde Mermaid-versie ondersteunt ook deze diagramtypen.',
    gantt: 'Gantt-diagram', classDiagram: 'Klassendiagram', state: 'Toestandsdiagram', entityRelationship: 'Entiteit-relatiediagram',
    journey: 'Gebruikersreis', git: 'Git-grafiek', mindmap: 'Mindmap', timeline: 'Tijdlijn', quadrant: 'Kwadrantdiagram',
    sankey: 'Sankey-diagram', xy: 'XY-diagram', requirement: 'Vereistendiagram', block: 'Blokdiagram', c4: 'C4-contextdiagram'
  },
  ar: {
    more: 'أمثلة Mermaid إضافية', description: 'يدعم إصدار Mermaid المثبت أيضاً أنواع المخططات التالية.',
    gantt: 'مخطط جانت', classDiagram: 'مخطط الفئات', state: 'مخطط الحالات', entityRelationship: 'مخطط الكيانات والعلاقات',
    journey: 'رحلة المستخدم', git: 'رسم Git البياني', mindmap: 'خريطة ذهنية', timeline: 'خط زمني', quadrant: 'مخطط رباعي',
    sankey: 'مخطط سانكي', xy: 'مخطط XY', requirement: 'مخطط المتطلبات', block: 'مخطط كتل', c4: 'مخطط سياق C4'
  },
  hi: {
    more: 'Mermaid के और उदाहरण', description: 'स्थापित Mermaid संस्करण इन आरेख प्रकारों का भी समर्थन करता है।',
    gantt: 'गैंट चार्ट', classDiagram: 'क्लास आरेख', state: 'स्थिति आरेख', entityRelationship: 'इकाई-संबंध आरेख',
    journey: 'उपयोगकर्ता यात्रा', git: 'Git ग्राफ़', mindmap: 'माइंड मैप', timeline: 'समयरेखा', quadrant: 'चतुर्थांश चार्ट',
    sankey: 'सैंकी आरेख', xy: 'XY चार्ट', requirement: 'आवश्यकता आरेख', block: 'ब्लॉक आरेख', c4: 'C4 संदर्भ आरेख'
  },
  ja: {
    more: 'Mermaid の追加例', description: 'インストール済みの Mermaid は、次のダイアグラム形式にも対応しています。',
    gantt: 'ガントチャート', classDiagram: 'クラス図', state: '状態遷移図', entityRelationship: 'ER 図',
    journey: 'ユーザージャーニー', git: 'Git グラフ', mindmap: 'マインドマップ', timeline: 'タイムライン', quadrant: '象限チャート',
    sankey: 'サンキー図', xy: 'XY チャート', requirement: '要件図', block: 'ブロック図', c4: 'C4 コンテキスト図'
  },
  zh: {
    more: '更多 Mermaid 示例', description: '已安装的 Mermaid 版本还支持以下图表类型。',
    gantt: '甘特图', classDiagram: '类图', state: '状态图', entityRelationship: '实体关系图',
    journey: '用户旅程', git: 'Git 图', mindmap: '思维导图', timeline: '时间线', quadrant: '四象限图',
    sankey: '桑基图', xy: 'XY 图表', requirement: '需求图', block: '块图', c4: 'C4 上下文图'
  },
  'zh-TW': {
    more: '更多 Mermaid 範例', description: '已安裝的 Mermaid 版本也支援以下圖表類型。',
    gantt: '甘特圖', classDiagram: '類別圖', state: '狀態圖', entityRelationship: '實體關係圖',
    journey: '使用者旅程', git: 'Git 圖', mindmap: '心智圖', timeline: '時間軸', quadrant: '象限圖',
    sankey: '桑基圖', xy: 'XY 圖表', requirement: '需求圖', block: '區塊圖', c4: 'C4 上下文圖'
  },
  ru: {
    more: 'Другие примеры Mermaid', description: 'Установленная версия Mermaid также поддерживает следующие типы диаграмм.',
    gantt: 'Диаграмма Ганта', classDiagram: 'Диаграмма классов', state: 'Диаграмма состояний', entityRelationship: 'ER-диаграмма',
    journey: 'Путь пользователя', git: 'Граф Git', mindmap: 'Интеллект-карта', timeline: 'Временная шкала', quadrant: 'Квадрантная диаграмма',
    sankey: 'Диаграмма Санки', xy: 'XY-диаграмма', requirement: 'Диаграмма требований', block: 'Блочная диаграмма', c4: 'Контекстная диаграмма C4'
  }
}

/** Localized examples inserted into every bundled Markdown guide. */
export function getExtraMermaidGuideExamples(language: Language): string {
  const label = LABELS[language]
  return String.raw`
### ${label.more}

${label.description}

**${label.gantt}**

~~~mermaid
gantt
  title Project plan
  dateFormat YYYY-MM-DD
  section Build
  Design :done, design, 2026-01-01, 2d
  Implement :active, implement, after design, 3d
~~~

**${label.classDiagram}**

~~~mermaid
classDiagram
  User --> Order
  class User {
    +String name
  }
  class Order {
    +submit()
  }
~~~

**${label.state}**

~~~mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Published
  Published --> [*]
~~~

**${label.entityRelationship}**

~~~mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string name
  }
  ORDER {
    int id
  }
~~~

**${label.journey}**

~~~mermaid
journey
  title Checkout
  section Buy
    Choose product: 5: Customer
    Pay: 3: Customer
~~~

**${label.git}**

~~~mermaid
gitGraph
  commit id: "Initial"
  branch feature
  checkout feature
  commit id: "Feature"
  checkout main
  merge feature
~~~

**${label.mindmap}**

~~~mermaid
mindmap
  root((Project))
    Plan
    Build
    Release
~~~

**${label.timeline}**

~~~mermaid
timeline
  title Product history
  2024 : Planning : Prototype
  2025 : Launch
~~~

**${label.quadrant}**

~~~mermaid
quadrantChart
  title Priority
  x-axis Low impact --> High impact
  y-axis Low effort --> High effort
  quadrant-1 Plan
  quadrant-2 Avoid
  quadrant-3 Delegate
  quadrant-4 Do now
  Feature A: [0.8, 0.3]
~~~

**${label.sankey}**

~~~mermaid
sankey-beta
  Visitors,Trial,100
  Trial,Subscribers,35
  Trial,Churned,65
~~~

**${label.xy}**

~~~mermaid
xychart-beta
  x-axis [Jan, Feb, Mar]
  y-axis "Sales" 0 --> 100
  bar [30, 55, 80]
  line [25, 45, 70]
~~~

**${label.requirement}**

~~~mermaid
requirementDiagram
  requirement login {
    id: 1
    text: User signs in
    risk: medium
    verifymethod: test
  }
  element app {
    type: software
  }
  app - satisfies -> login
~~~

**${label.block}**

~~~mermaid
block-beta
  columns 2
  A["Client"] B["API"]
  A --> B
~~~

**${label.c4}**

~~~mermaid
C4Context
  title System context
  Person(user, "User")
  System(app, "Application")
  Rel(user, app, "Uses")
~~~
`
}
