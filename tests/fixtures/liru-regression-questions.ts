// Prompts and source expectations for the synthetic Liru integration fixtures.
export const liruQuestions = {
  captains: { count: "本屆有多少隊長？", recheck: "應該不止吧" },
  registration: [
    "有多少人報名了",
    "選手有多少",
    "报名人数是多少？",
    "How many people have registered?",
  ],
  historicalDt: [
    "從歷史記錄查看哪些選手擅長DT？",
    "从历史记录看哪些选手擅长 DT？",
    "Which players performed best on the DT pool across past seasons?",
  ],
  publicAlias: {
    name: "Synthetic Former Name",
    questions: ["Synthetic Former Name是谁？", "Who is Synthetic Former Name?"],
    privateName: "Synthetic Unreleased Name",
    privateQuestion: "Synthetic Unreleased Name是誰？",
  },
  beatmap: {
    questions: [
      "星際旋律是哪首？",
      "谱面 Historical Title 是哪首？",
      "Which beatmap is Historical Title?",
    ],
    title: "Historical Title",
  },
  artwork: {
    original: "譜面BG圖是美少女的譜面/map",
    standalone: "有哪些背景圖有美少女",
    clarification: "我說的就是譜面背景",
    questions: [
      { question: "藍髮的譜面背景圖有哪些？", subject: "藍髮" },
      { question: "有哪些背景图是蓝发美少女？", subject: "蓝发美少女" },
      {
        question: "Which beatmap backgrounds show an anime girl?",
        subject: "anime girl",
      },
    ],
    expectedUrl: "https://osu.ppy.sh/beatmaps/123456",
  },
};
