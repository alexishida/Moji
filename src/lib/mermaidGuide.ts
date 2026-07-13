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
  'pt-BR': {
    more: 'Outros exemplos Mermaid', description: 'A versão Mermaid instalada também suporta estes tipos de diagrama.',
    gantt: 'Gráfico de Gantt', classDiagram: 'Diagrama de classes', state: 'Diagrama de estados', entityRelationship: 'Diagrama entidade-relacionamento',
    journey: 'Jornada do usuário', git: 'Gráfico Git', mindmap: 'Mapa mental', timeline: 'Linha do tempo', quadrant: 'Gráfico de quadrantes',
    sankey: 'Diagrama Sankey', xy: 'Gráfico XY', requirement: 'Diagrama de requisitos', block: 'Diagrama de blocos', c4: 'Diagrama de contexto C4'
  },
  es: {
    more: 'Más ejemplos de Mermaid', description: 'La versión instalada de Mermaid también admite estos tipos de diagramas.',
    gantt: 'Diagrama de Gantt', classDiagram: 'Diagrama de clases', state: 'Diagrama de estados', entityRelationship: 'Diagrama entidad-relación',
    journey: 'Viaje del usuario', git: 'Gráfico Git', mindmap: 'Mapa mental', timeline: 'Línea de tiempo', quadrant: 'Gráfico de cuadrantes',
    sankey: 'Diagrama Sankey', xy: 'Gráfico XY', requirement: 'Diagrama de requisitos', block: 'Diagrama de bloques', c4: 'Diagrama de contexto C4'
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
