// Synthetic API response; not a snapshot of a real osu! player.
export const profileResponse = {
  id: 260001,
  username: "Synthetic Profile Player",
  avatar_url: "https://a.ppy.sh/260001",
  country_code: "TW",
  country: { code: "TW", name: "Taiwan" },
  cover: {
    url: "https://assets.ppy.sh/user-profile-covers/260001/synthetic.jpg",
  },
  playmode: "mania",
  join_date: "2014-01-01T00:00:00+00:00",
  last_visit: null,
  is_active: true,
  is_bot: false,
  previous_usernames: ["Synthetic Former Name"],
  statistics: {
    global_rank: 12345,
    country_rank: 678,
    pp: 1234.56,
    hit_accuracy: 97.25,
    play_count: 123,
    play_time: 123456,
    ranked_score: "9007199254740993",
    total_score: 987654321,
    maximum_combo: 456,
    total_hits: 789012,
    level: { current: 75, progress: 42 },
    grade_counts: { ssh: 1, ss: 2, sh: 3, s: 4, a: 5 },
  },
  rank_history: {
    mode: "osu",
    // One unranked day has no point but still occupies its original date.
    data: [16200, null, 15500, 15000],
  },
  discord: "MUST_NOT_CACHE_PRIVATE_CONTACT",
  account_history: [{ description: "MUST_NOT_CACHE_HISTORY" }],
};
