import { Quote } from "./types";

/**
 * Motivational quotes for the break reminder popup, themed on the
 * things a researcher taking a five-minute breather actually wants to
 * hear about: growth, effort, learning, and the long grind of
 * skill-building.
 *
 * Fetched from Quotable (https://api.quotable.io) — a free, no-auth,
 * CORS-enabled quote API, reachable straight from the browser the same
 * way `library`'s Crossref lookup is (there's no backend here to proxy
 * through). Its `tags` parameter is why it's the pick over the
 * alternatives: the topic filter below is what keeps this on-theme
 * instead of serving generic inspirational filler.
 *
 * That API is also, in practice, not reliably up — so `FALLBACK_QUOTES`
 * below isn't defensive boilerplate, it's the path this genuinely
 * takes whenever the request fails, times out, or the host is down.
 * The feature is designed to work identically offline; a reachable API
 * just widens the pool.
 */

const QUOTE_API_URL =
  "https://api.quotable.io/random?tags=success|wisdom|education|knowledge|perseverance&maxLength=140";

const REQUEST_TIMEOUT_MS = 3000;

const FALLBACK_QUOTES: Quote[] = [
  { text: "Growth is never by mere chance; it is the result of forces working together.", author: "James Cash Penney" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Rest is not idleness; it is the condition of good work.", author: "John Lubbock" },
  { text: "Research is what I'm doing when I don't know what I'm doing.", author: "Wernher von Braun" },
  { text: "If we knew what it was we were doing, it would not be called research.", author: "Albert Einstein" },
  { text: "The important thing is not to stop questioning.", author: "Albert Einstein" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "Patience, persistence and perspiration make an unbeatable combination for success.", author: "Napoleon Hill" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "Continuous improvement is better than delayed perfection.", author: "Mark Twain" },
  { text: "Nothing in life is to be feared, it is only to be understood.", author: "Marie Curie" },
  { text: "The beautiful thing about learning is that nobody can take it away from you.", author: "B.B. King" },
  { text: "Perseverance is not a long race; it is many short races one after the other.", author: "Walter Elliot" },
  { text: "Deep work is the ability to focus without distraction on a cognitively demanding task.", author: "Cal Newport" },
];

function randomFallback(): Quote {
  return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
}

export const quoteService = {
  /**
   * One on-theme quote. Never rejects and never resolves null — an
   * unreachable API, a timeout, or an unexpected response body all
   * fall through to a bundled quote, since a break reminder that
   * shows an error where the encouragement should be would be worse
   * than showing a slightly less varied one.
   */
  async getQuote(): Promise<Quote> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(QUOTE_API_URL, { signal: controller.signal });
        if (!response.ok) return randomFallback();
        const body = await response.json();
        if (typeof body?.content === "string" && body.content.trim()) {
          return { text: body.content, author: body.author || "Unknown" };
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Offline, blocked, timed out, or the host is down — all the
      // same thing from here.
    }
    return randomFallback();
  },
};
