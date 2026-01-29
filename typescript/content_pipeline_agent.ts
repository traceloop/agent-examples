import { openai } from "@ai-sdk/openai";
import { generateText, tool, generateObject } from "ai";
import { z } from "zod";
import * as Traceloop from "@traceloop/node-server-sdk";

// Initialize Traceloop
Traceloop.initialize({
  appName: "content-creation-pipeline",
  disableBatch: true,
});

// ============================================================================
// DATA CONTRACTS - ZOD SCHEMAS
// ============================================================================

// Input Schema
const TopicRequestSchema = z.object({
  topic: z.string().describe("The topic to write about"),
  target_audience: z
    .string()
    .optional()
    .describe("Target audience (e.g., 'beginners', 'professionals')"),
  content_type: z
    .string()
    .optional()
    .describe("Article type (e.g., 'tutorial', 'news', 'analysis')"),
  word_count_target: z.number().optional().default(1500),
});

// Orchestrator → Research
const TopicAnalysisSchema = z.object({
  topic: z.string(),
  content_type: z.enum(["news", "tutorial", "analysis", "evergreen"]),
  complexity_level: z.enum(["simple", "moderate", "complex"]),
  recommended_research_depth: z.enum(["shallow", "moderate", "deep"]),
  recommended_sources: z.array(z.string()),
  target_audience: z.string(),
  word_count_target: z.number(),
});

// Research → Writer
const ResearchOutputSchema = z.object({
  topic: z.string(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      summary: z.string(),
      relevance_score: z.number(),
      publication_date: z.string().optional(),
      source_type: z.enum(["news", "academic", "encyclopedia", "web"]),
    })
  ),
  key_facts: z.array(z.string()),
  statistics: z.array(
    z.object({
      metric: z.string(),
      value: z.string(),
      source: z.string(),
    })
  ),
  background_info: z.string(),
  research_quality_score: z.number().min(0).max(100),
});

// Writer → Editor
const ArticleDraftSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  outline: z.object({
    introduction: z.string(),
    sections: z.array(
      z.object({
        heading: z.string(),
        subheadings: z.array(z.string()),
      })
    ),
    conclusion: z.string(),
  }),
  content: z.string().describe("Full article content in markdown"),
  word_count: z.number(),
  citations: z.array(
    z.object({
      reference_number: z.number(),
      source_url: z.string(),
      inline_location: z.string(),
    })
  ),
  draft_quality_score: z.number().min(0).max(100),
});

// Editor → SEO
const EditedArticleSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  content: z.string().describe("Edited article content in markdown"),
  word_count: z.number(),
  citations: z.array(
    z.object({
      reference_number: z.number(),
      source_url: z.string(),
      inline_location: z.string(),
    })
  ),
  readability_metrics: z.object({
    flesch_kincaid_grade: z.number(),
    avg_sentence_length: z.number(),
    complex_word_percentage: z.number(),
    reading_time_minutes: z.number(),
  }),
  grammar_issues_fixed: z.number(),
  improvements_made: z.array(z.string()),
  edit_quality_score: z.number().min(0).max(100),
});

// Final Output
const FinalArticleSchema = z.object({
  // Article content
  title: z.string(),
  subtitle: z.string().optional(),
  content: z.string().describe("Final optimized article in markdown"),
  word_count: z.number(),
  citations: z.array(
    z.object({
      reference_number: z.number(),
      source_url: z.string(),
      inline_location: z.string(),
    })
  ),

  // SEO metadata
  seo_metadata: z.object({
    title_tag: z.string(),
    meta_description: z.string(),
    primary_keyword: z.string(),
    secondary_keywords: z.array(z.string()),
    keyword_density: z.number(),
    og_tags: z.object({
      og_title: z.string(),
      og_description: z.string(),
      og_type: z.string(),
    }),
  }),

  // SEO recommendations
  seo_recommendations: z.array(z.string()),
  internal_link_suggestions: z.array(
    z.object({
      anchor_text: z.string(),
      suggested_topic: z.string(),
    })
  ),

  // Quality metrics
  readability_metrics: z.object({
    flesch_kincaid_grade: z.number(),
    avg_sentence_length: z.number(),
    complex_word_percentage: z.number(),
    reading_time_minutes: z.number(),
  }),

  seo_score: z.number().min(0).max(100),
  overall_quality_score: z.number().min(0).max(100),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================


// Readability calculations
function calculateFleschKincaid(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const words = text.split(/\s+/).filter((w) => w.trim().length > 0).length;
  const syllables = countSyllables(text);

  if (sentences === 0 || words === 0) return 0;

  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
}

function calculateGunningFog(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const words = text.split(/\s+/).filter((w) => w.trim().length > 0).length;
  const complexWords = countComplexWords(text);

  if (sentences === 0 || words === 0) return 0;

  return 0.4 * ((words / sentences) + 100 * (complexWords / words));
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let totalSyllables = 0;

  for (const word of words) {
    if (word.length === 0) continue;

    // Simple syllable counting heuristic
    let syllables = 0;
    let vowelGroup = false;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if ("aeiouy".includes(char)) {
        if (!vowelGroup) {
          syllables++;
          vowelGroup = true;
        }
      } else {
        vowelGroup = false;
      }
    }

    // Adjust for silent e
    if (word.endsWith("e")) {
      syllables = Math.max(1, syllables - 1);
    }

    // Every word has at least 1 syllable
    syllables = Math.max(1, syllables);
    totalSyllables += syllables;
  }

  return totalSyllables;
}

function countComplexWords(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let complexCount = 0;

  for (const word of words) {
    if (word.length === 0) continue;

    const syllables = countSyllablesInWord(word);
    if (syllables >= 3) {
      complexCount++;
    }
  }

  return complexCount;
}

function countSyllablesInWord(word: string): number {
  let syllables = 0;
  let vowelGroup = false;

  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if ("aeiouy".includes(char)) {
      if (!vowelGroup) {
        syllables++;
        vowelGroup = true;
      }
    } else {
      vowelGroup = false;
    }
  }

  if (word.endsWith("e")) {
    syllables = Math.max(1, syllables - 1);
  }

  return Math.max(1, syllables);
}

function extractKeywordsNLP(text: string, maxKeywords: number = 10): string[] {
  // Simple keyword extraction based on word frequency
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

  // Common stop words to filter out
  const stopWords = new Set([
    "that", "this", "with", "from", "have", "been", "will", "their", "would",
    "about", "which", "there", "when", "where", "what", "these", "those",
    "they", "them", "then", "than", "such", "some", "said", "more", "into"
  ]);

  // Count word frequency
  const wordFreq: Record<string, number> = {};
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  // Sort by frequency and return top keywords
  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

function calculateKeywordDensity(text: string, keyword: string): number {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.trim().length > 0);
  const keywordWords = keyword.toLowerCase().split(/\s+/);

  let count = 0;
  for (let i = 0; i <= words.length - keywordWords.length; i++) {
    let match = true;
    for (let j = 0; j < keywordWords.length; j++) {
      if (words[i + j] !== keywordWords[j]) {
        match = false;
        break;
      }
    }
    if (match) count++;
  }

  return (count / words.length) * 100;
}

// ============================================================================
// ORCHESTRATOR AGENT TOOLS (6 tools)
// ============================================================================

const analyzeTopicIntentShallowTool = tool({
  description: "Quick classification of topic into content type categories (news/tutorial/analysis/evergreen)",
  parameters: z.object({
    topic: z.string().describe("The topic to analyze"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Orchestrator] Performing shallow topic analysis for: ${topic}`);

    try {

      // Simple heuristic classification
      const lowerTopic = topic.toLowerCase();
      let contentType: "news" | "tutorial" | "analysis" | "evergreen" = "evergreen";

      if (lowerTopic.includes("recent") || lowerTopic.includes("latest") || lowerTopic.includes("2024") || lowerTopic.includes("2025") || lowerTopic.includes("2026")) {
        contentType = "news";
      } else if (lowerTopic.includes("how to") || lowerTopic.includes("guide") || lowerTopic.includes("tutorial")) {
        contentType = "tutorial";
      } else if (lowerTopic.includes("impact") || lowerTopic.includes("analysis") || lowerTopic.includes("effect")) {
        contentType = "analysis";
      }

      return {
        status: "success",
        content_type: contentType,
        complexity_level: "moderate",
        confidence: "medium",
        message: `Quick analysis complete: ${contentType} content type detected`
      };
    } catch (error: any) {
      console.error(`Error in shallow topic analysis: ${error.message}`);
      return {
        status: "error",
        message: `Failed to analyze topic: ${error.message}`,
      };
    }
  },
});

const analyzeTopicIntentDeepTool = tool({
  description: "Detailed analysis of topic with sub-categories, nuances, and comprehensive classification",
  parameters: z.object({
    topic: z.string().describe("The topic to analyze deeply"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Orchestrator] Performing deep topic analysis for: ${topic}`);

    try {

      // Use LLM for deeper analysis
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: "You are an expert content strategist. Analyze topics and classify them precisely."
          },
          {
            role: "user",
            content: `Analyze this topic and provide detailed classification: "${topic}"`
          }
        ],
        schema: z.object({
          content_type: z.enum(["news", "tutorial", "analysis", "evergreen"]),
          sub_category: z.string(),
          complexity_level: z.enum(["simple", "moderate", "complex"]),
          target_audience: z.string(),
          recommended_tone: z.string(),
          key_themes: z.array(z.string()),
        }),
      });

      return {
        status: "success",
        ...result.object,
        confidence: "high",
        message: `Deep analysis complete: ${result.object.content_type} (${result.object.sub_category})`
      };
    } catch (error: any) {
      console.error(`Error in deep topic analysis: ${error.message}`);
      return {
        status: "error",
        message: `Failed to deeply analyze topic: ${error.message}`,
      };
    }
  },
});

const validateTopicFeasibilityQuickTool = tool({
  description: "Fast web search check to verify if content exists for the topic",
  parameters: z.object({
    topic: z.string().describe("The topic to validate"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Orchestrator] Quick feasibility check for: ${topic}`);

    try {

      // Simple Wikipedia check
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
        {
          headers: {
            "User-Agent": "ContentPipelineAgent/1.0 (OpenTelemetry Sample)",
          },
        }
      );

      const feasible = response.ok;

      return {
        status: "success",
        feasible,
        confidence: "medium",
        message: feasible
          ? `Topic appears feasible - found Wikipedia entry`
          : `Topic may be challenging - no Wikipedia entry found`,
        sources_checked: ["Wikipedia"],
      };
    } catch (error: any) {
      console.error(`Error in quick feasibility check: ${error.message}`);
      return {
        status: "error",
        message: `Failed to check feasibility: ${error.message}`,
      };
    }
  },
});

const validateTopicFeasibilityThoroughTool = tool({
  description: "Multi-source validation checking Wikipedia, news, and academic sources",
  parameters: z.object({
    topic: z.string().describe("The topic to validate thoroughly"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Orchestrator] Thorough feasibility check for: ${topic}`);

    try {

      const sources: string[] = [];
      let successCount = 0;

      // Check Wikipedia
      try {
        const wikiResponse = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
          {
            headers: {
              "User-Agent": "ContentPipelineAgent/1.0",
            },
          }
        );
        if (wikiResponse.ok) {
          sources.push("Wikipedia");
          successCount++;
        }
      } catch (e) {
        // Silent fail
      }


      // Check if we can get general web info (simulate)
      sources.push("Web search");
      successCount++;

      const feasible = successCount >= 1;

      return {
        status: "success",
        feasible,
        confidence: "high",
        message: feasible
          ? `Topic is highly feasible - found ${successCount} source types`
          : `Topic appears difficult - limited sources available`,
        sources_checked: sources,
        source_count: successCount,
      };
    } catch (error: any) {
      console.error(`Error in thorough feasibility check: ${error.message}`);
      return {
        status: "error",
        message: `Failed to check feasibility thoroughly: ${error.message}`,
      };
    }
  },
});

const estimateComplexityTool = tool({
  description: "Predicts research depth, writing difficulty, and pipeline requirements",
  parameters: z.object({
    topic: z.string().describe("The topic to estimate complexity for"),
    content_type: z.string().describe("The content type (news/tutorial/analysis/evergreen)"),
  }),
  execute: async ({ topic, content_type }) => {
    console.log(`[Orchestrator] Estimating complexity for ${content_type}: ${topic}`);

    try {

      // Heuristic-based complexity estimation
      const wordCount = topic.split(/\s+/).length;
      const hasSpecialTerms = /quantum|advanced|complex|enterprise|distributed|architecture/i.test(topic);

      let researchDepth: "shallow" | "moderate" | "deep" = "moderate";
      let writingDifficulty: "easy" | "moderate" | "hard" = "moderate";

      if (content_type === "news") {
        researchDepth = "shallow";
        writingDifficulty = "easy";
      } else if (content_type === "tutorial" && hasSpecialTerms) {
        researchDepth = "deep";
        writingDifficulty = "hard";
      } else if (content_type === "analysis") {
        researchDepth = "deep";
        writingDifficulty = "moderate";
      }

      return {
        status: "success",
        research_depth: researchDepth,
        writing_difficulty: writingDifficulty,
        estimated_time_minutes: researchDepth === "deep" ? 15 : researchDepth === "moderate" ? 10 : 5,
        recommended_tools: {
          research: researchDepth === "deep" ? ["academic", "news", "encyclopedia"] : ["encyclopedia", "web"],
          writing: writingDifficulty === "hard" ? ["detailed_outline", "long_draft"] : ["basic_outline", "short_draft"],
        },
        message: `Complexity estimated: ${researchDepth} research, ${writingDifficulty} writing`
      };
    } catch (error: any) {
      console.error(`Error estimating complexity: ${error.message}`);
      return {
        status: "error",
        message: `Failed to estimate complexity: ${error.message}`,
      };
    }
  },
});

const suggestPipelineConfigurationTool = tool({
  description: "Recommends which tools downstream agents should prioritize based on topic analysis",
  parameters: z.object({
    topic: z.string().describe("The topic"),
    content_type: z.string().describe("Content type"),
    complexity_level: z.string().describe("Complexity level"),
  }),
  execute: async ({ topic, content_type, complexity_level }) => {
    console.log(`[Orchestrator] Suggesting pipeline configuration for ${content_type} content`);

    try {

      const config = {
        research_tools: [] as string[],
        writing_tools: [] as string[],
        editing_tools: [] as string[],
        seo_tools: [] as string[],
      };

      // Research recommendations
      if (content_type === "news") {
        config.research_tools = ["searchNewsAPI", "searchNewsData"];
      } else if (content_type === "tutorial") {
        config.research_tools = ["fetchWikipediaContent", "searchDuckDuckGo"];
      } else if (content_type === "analysis") {
        config.research_tools = ["searchGoogleScholar", "fetchArxivPapers", "fetchWikipediaContent"];
      } else {
        config.research_tools = ["fetchWikipediaContent", "searchDuckDuckGo"];
      }

      // Writing recommendations
      if (complexity_level === "complex") {
        config.writing_tools = ["generateOutlineDetailed", "writeDraftLong"];
      } else {
        config.writing_tools = ["generateOutlineBasic", "writeDraftShort"];
      }

      // Editing recommendations
      config.editing_tools = ["analyzeReadabilityFlesch", "checkGrammarLanguageTool"];
      if (content_type === "analysis") {
        config.editing_tools.push("checkFactAccuracy");
      }

      // SEO recommendations
      config.seo_tools = ["analyzeKeywordsSerper", "generateMetaTagsLong", "generateOpenGraphTags"];

      return {
        status: "success",
        configuration: config,
        message: `Pipeline configuration suggested for ${content_type} content`,
        rationale: `Based on ${content_type} type and ${complexity_level} complexity`
      };
    } catch (error: any) {
      console.error(`Error suggesting pipeline configuration: ${error.message}`);
      return {
        status: "error",
        message: `Failed to suggest configuration: ${error.message}`,
      };
    }
  },
});

// ============================================================================
// RESEARCH AGENT TOOLS (8 tools)
// ============================================================================

const searchNewsAPITool = tool({
  description: "Search for comprehensive news articles using NewsAPI.org (slower but higher quality)",
  parameters: z.object({
    topic: z.string().describe("The topic to search news for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Searching NewsAPI for: ${topic}`);

    try {

      const apiKey = process.env.NEWS_API_KEY;
      if (!apiKey) {
        return {
          status: "error",
          message: "NEWS_API_KEY environment variable not set",
          articles: [],
        };
      }

      const response = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=5&apiKey=${apiKey}`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const articles = (data.articles || []).map((article: any) => ({
        url: article.url,
        title: article.title,
        summary: article.description || "",
        source: article.source?.name || "Unknown",
        publication_date: article.publishedAt,
        relevance_score: 85,
      }));

      return {
        status: "success",
        message: `Found ${articles.length} news articles from NewsAPI`,
        articles,
        source_quality: "high",
      };
    } catch (error: any) {
      console.error(`Error searching NewsAPI: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search NewsAPI: ${error.message}`,
        articles: [],
      };
    }
  },
});

const searchNewsDataTool = tool({
  description: "Search for recent news articles using NewsData.io (faster, more recent, smaller articles)",
  parameters: z.object({
    topic: z.string().describe("The topic to search news for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Searching NewsData.io for: ${topic}`);

    try {

      // Simulated NewsData.io response (replace with real API key)
      const articles = [
        {
          url: `https://example.com/news/${encodeURIComponent(topic)}`,
          title: `Latest developments in ${topic}`,
          summary: `Recent news about ${topic} shows continued interest and development.`,
          source: "NewsData.io",
          publication_date: new Date().toISOString(),
          relevance_score: 80,
        },
      ];

      return {
        status: "success",
        message: `Found ${articles.length} recent articles from NewsData.io`,
        articles,
        source_quality: "medium",
      };
    } catch (error: any) {
      console.error(`Error searching NewsData: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search NewsData: ${error.message}`,
        articles: [],
      };
    }
  },
});

const fetchWikipediaContentTool = tool({
  description: "Fetch detailed background from Wikipedia REST API (encyclopedic, comprehensive)",
  parameters: z.object({
    topic: z.string().describe("The topic to fetch Wikipedia content for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Fetching detailed Wikipedia content for: ${topic}`);

    try {

      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
        {
          headers: {
            "User-Agent": "ContentPipelineAgent/1.0",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        status: "success",
        message: `Retrieved detailed Wikipedia content for ${topic}`,
        title: data.title,
        extract: data.extract,
        url: data.content_urls?.desktop?.page || "",
        source_type: "encyclopedia",
        relevance_score: 90,
      };
    } catch (error: any) {
      console.error(`Error fetching Wikipedia content: ${error.message}`);
      return {
        status: "error",
        message: `Failed to fetch Wikipedia content: ${error.message}`,
      };
    }
  },
});

const fetchWikipediaSummaryTool = tool({
  description: "Fetch quick Wikipedia summary (overview only, less detail but faster)",
  parameters: z.object({
    topic: z.string().describe("The topic to fetch summary for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Fetching Wikipedia summary for: ${topic}`);

    try {

      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
        {
          headers: {
            "User-Agent": "ContentPipelineAgent/1.0",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        status: "success",
        message: `Retrieved Wikipedia summary for ${topic}`,
        title: data.title,
        description: data.description || "",
        short_extract: data.extract?.split(".").slice(0, 2).join(".") + ".", // First 2 sentences
        url: data.content_urls?.desktop?.page || "",
        source_type: "encyclopedia",
        relevance_score: 85,
      };
    } catch (error: any) {
      console.error(`Error fetching Wikipedia summary: ${error.message}`);
      return {
        status: "error",
        message: `Failed to fetch Wikipedia summary: ${error.message}`,
      };
    }
  },
});

const searchDuckDuckGoTool = tool({
  description: "Search DuckDuckGo for instant answers, fast facts, and definitions",
  parameters: z.object({
    topic: z.string().describe("The topic to search for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Searching DuckDuckGo for: ${topic}`);

    try {

      // DuckDuckGo Instant Answer API
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        status: "success",
        message: `Retrieved DuckDuckGo results for ${topic}`,
        abstract: data.Abstract || "No abstract available",
        definition: data.Definition || "",
        answer: data.Answer || "",
        url: data.AbstractURL || "",
        source_type: "web",
        relevance_score: 75,
      };
    } catch (error: any) {
      console.error(`Error searching DuckDuckGo: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search DuckDuckGo: ${error.message}`,
      };
    }
  },
});

const gatherStatisticsTool = tool({
  description: "Gather structured quantitative data and statistics (REST Countries API for demo)",
  parameters: z.object({
    topic: z.string().describe("The topic to gather statistics for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Gathering statistics for: ${topic}`);

    try {

      // Simulated statistics gathering
      const statistics = [
        {
          metric: `${topic} adoption rate`,
          value: "45%",
          source: "Industry Report 2026",
        },
        {
          metric: `Market size`,
          value: "$2.4B",
          source: "Market Research Firm",
        },
      ];

      return {
        status: "success",
        message: `Gathered ${statistics.length} statistics for ${topic}`,
        statistics,
        source_type: "quantitative",
        relevance_score: 70,
      };
    } catch (error: any) {
      console.error(`Error gathering statistics: ${error.message}`);
      return {
        status: "error",
        message: `Failed to gather statistics: ${error.message}`,
        statistics: [],
      };
    }
  },
});

const fetchArxivPapersTool = tool({
  description: "Search arXiv for academic research papers and citations",
  parameters: z.object({
    topic: z.string().describe("The topic to search academic papers for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Searching arXiv for: ${topic}`);

    try {

      // arXiv API
      const response = await fetch(
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topic)}&start=0&max_results=3`
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const xmlText = await response.text();

      // Simple XML parsing for arXiv entries
      const entries: any[] = [];
      const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
      const matches = xmlText.match(entryRegex);

      if (matches) {
        for (const match of matches.slice(0, 3)) {
          const titleMatch = match.match(/<title>(.*?)<\/title>/);
          const summaryMatch = match.match(/<summary>(.*?)<\/summary>/);
          const linkMatch = match.match(/<id>(.*?)<\/id>/);

          entries.push({
            title: titleMatch ? titleMatch[1].trim() : "Untitled",
            summary: summaryMatch ? summaryMatch[1].trim().substring(0, 200) : "",
            url: linkMatch ? linkMatch[1].trim() : "",
            source_type: "academic",
            relevance_score: 88,
          });
        }
      }

      return {
        status: "success",
        message: `Found ${entries.length} academic papers from arXiv`,
        papers: entries,
        source_type: "academic",
      };
    } catch (error: any) {
      console.error(`Error searching arXiv: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search arXiv: ${error.message}`,
        papers: [],
      };
    }
  },
});

const searchGoogleScholarTool = tool({
  description: "Search Google Scholar via Serper API for scholarly articles and credibility",
  parameters: z.object({
    topic: z.string().describe("The topic to search scholarly articles for"),
  }),
  execute: async ({ topic }) => {
    console.log(`[Research] Searching Google Scholar for: ${topic}`);

    try {

      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        return {
          status: "error",
          message: "SERPER_API_KEY environment variable not set",
          papers: [],
        };
      }

      const response = await fetch("https://google.serper.dev/scholar", {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: topic,
          num: 3,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const papers = (data.organic || []).map((paper: any) => ({
        title: paper.title,
        summary: paper.snippet || "",
        url: paper.link,
        citations: paper.inline_links?.cited_by?.total || 0,
        source_type: "academic",
        relevance_score: 92,
      }));

      return {
        status: "success",
        message: `Found ${papers.length} scholarly articles from Google Scholar`,
        papers,
        source_type: "academic",
      };
    } catch (error: any) {
      console.error(`Error searching Google Scholar: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search Google Scholar: ${error.message}`,
        papers: [],
      };
    }
  },
});

// ============================================================================
// WRITER AGENT TOOLS (7 tools)
// ============================================================================

const generateOutlineBasicTool = tool({
  description: "Generate quick outline with 3-5 main sections (faster)",
  parameters: z.object({
    topic: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ topic, research_data }) => {
    console.log(`[Writer] Generating basic outline for: ${topic}`);
    try {
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          sections: z.array(z.string()),
          estimated_word_count: z.number(),
        }),
        messages: [{role: "user", content: `Create basic 3-5 section outline for: ${topic}\nResearch: ${research_data.substring(0, 500)}`}],
      });
      return {status: "success", outline: result.object};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const generateOutlineDetailedTool = tool({
  description: "Generate comprehensive outline with sections and subsections (slower, more detailed)",
  parameters: z.object({
    topic: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ topic, research_data }) => {
    console.log(`[Writer] Generating detailed outline for: ${topic}`);
    try {
      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          sections: z.array(z.object({
            heading: z.string(),
            subheadings: z.array(z.string()),
          })),
          estimated_word_count: z.number(),
        }),
        messages: [{role: "user", content: `Create detailed outline with subsections for: ${topic}\nResearch: ${research_data.substring(0, 1000)}`}],
      });
      return {status: "success", outline: result.object};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const writeDraftShortTool = tool({
  description: "Write 500-1000 word draft using GPT-4o-mini (faster, economical)",
  parameters: z.object({
    topic: z.string(),
    outline: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ topic, outline, research_data }) => {
    console.log(`[Writer] Writing short draft for: ${topic}`);
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [{role: "user", content: `Write 500-1000 word article about ${topic}.\nOutline: ${outline}\nResearch: ${research_data.substring(0, 1000)}`}],
      });
      return {status: "success", content: result.text, word_count: result.text.split(/\s+/).length};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const writeDraftLongTool = tool({
  description: "Write 1500-3000 word draft using GPT-4o (higher quality, slower)",
  parameters: z.object({
    topic: z.string(),
    outline: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ topic, outline, research_data }) => {
    console.log(`[Writer] Writing long draft for: ${topic}`);
    try {
      const result = await generateText({
        model: openai("gpt-4o"),
        messages: [{role: "user", content: `Write comprehensive 1500-3000 word article about ${topic}.\nOutline: ${outline}\nResearch: ${research_data.substring(0, 2000)}`}],
        maxTokens: 4000,
      });
      return {status: "success", content: result.text, word_count: result.text.split(/\s+/).length};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const writeSectionBySectionTool = tool({
  description: "Generate article one section at a time (modular approach, more control)",
  parameters: z.object({
    topic: z.string(),
    section_heading: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ topic, section_heading, research_data }) => {
    console.log(`[Writer] Writing section: ${section_heading}`);
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [{role: "user", content: `Write the "${section_heading}" section for article about ${topic}.\nResearch: ${research_data.substring(0, 800)}`}],
      });
      return {status: "success", section_content: result.text};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const addCitationsInlineTool = tool({
  description: "Embed citations during writing (integrated approach, web style)",
  parameters: z.object({
    content: z.string(),
    sources: z.string(),
  }),
  execute: async ({ content, sources }) => {
    console.log(`[Writer] Adding inline citations`);
    try {
      // Simple citation insertion
      const citations = JSON.parse(sources || "[]");
      let citedContent = content;
      citations.forEach((source: any, idx: number) => {
        citedContent += `\n[${idx + 1}] ${source.title} - ${source.url}`;
      });
      return {status: "success", content: citedContent, citation_count: citations.length};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const addCitationsBibliographyTool = tool({
  description: "Add formatted bibliography at end (academic style)",
  parameters: z.object({
    content: z.string(),
    sources: z.string(),
  }),
  execute: async ({ content, sources }) => {
    console.log(`[Writer] Adding bibliography`);
    try {
      const citations = JSON.parse(sources || "[]");
      let bibliography = "\n\n## References\n\n";
      citations.forEach((source: any, idx: number) => {
        bibliography += `${idx + 1}. ${source.title}. Available at: ${source.url}\n`;
      });
      return {status: "success", content: content + bibliography, citation_count: citations.length};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

// ============================================================================
// EDITOR AGENT TOOLS (9 tools)
// ============================================================================

const analyzeReadabilityFleschTool = tool({
  description: "Calculate Flesch-Kincaid readability score (standard metric)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Analyzing Flesch-Kincaid readability`);
    try {
      const score = calculateFleschKincaid(content);
      const words = content.split(/\s+/).length;
      return {
        status: "success",
        flesch_kincaid_grade: score,
        readability_level: score > 60 ? "easy" : score > 30 ? "moderate" : "difficult",
        word_count: words,
      };
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const analyzeReadabilityGunningTool = tool({
  description: "Calculate Gunning Fog Index (alternative metric)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Analyzing Gunning Fog readability`);
    try {
      const score = calculateGunningFog(content);
      return {
        status: "success",
        gunning_fog_index: score,
        reading_grade_level: Math.round(score),
      };
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const analyzeReadabilityDALETool = tool({
  description: "Calculate DALE-Chall readability (vocabulary complexity)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Analyzing DALE-Chall readability`);
    try {
      const complexWords = countComplexWords(content);
      const totalWords = content.split(/\s+/).length;
      const score = (complexWords / totalWords) * 100;
      return {
        status: "success",
        complex_word_percentage: score,
        vocabulary_level: score < 5 ? "simple" : score < 10 ? "moderate" : "complex",
      };
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const checkGrammarBasicTool = tool({
  description: "Basic regex-based grammar checks (fast, limited coverage)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Running basic grammar checks`);
    try {
      let issues = 0;
      // Check for double spaces
      if (content.includes("  ")) issues++;
      // Check for missing spaces after periods
      if (/\.[A-Z]/.test(content)) issues++;
      return {status: "success", issues_found: issues, check_type: "basic"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const checkGrammarLanguageToolTool = tool({
  description: "Comprehensive grammar checking via LanguageTool API (slower, thorough)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Running LanguageTool grammar check`);
    try {
      // Simulated LanguageTool response
      const issues = Math.floor(content.length / 500);
      return {status: "success", issues_found: issues, check_type: "comprehensive"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const improveClarityAggressiveTool = tool({
  description: "Major rewrite for clarity using GPT-4o (changes structure, high quality)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Aggressive clarity improvement`);
    try {
      const result = await generateText({
        model: openai("gpt-4o"),
        messages: [{role: "user", content: `Significantly improve clarity and flow of this text, restructure as needed:\n\n${content.substring(0, 2000)}`}],
      });
      return {status: "success", improved_content: result.text, changes: "major"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const improveClarityConservativeTool = tool({
  description: "Minor tweaks for clarity using GPT-4o-mini (preserves voice, faster)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Conservative clarity improvement`);
    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [{role: "user", content: `Make minor improvements to clarity while preserving the author's voice:\n\n${content.substring(0, 1500)}`}],
      });
      return {status: "success", improved_content: result.text, changes: "minor"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const checkFactAccuracyTool = tool({
  description: "Cross-reference claims with research data",
  parameters: z.object({
    content: z.string(),
    research_data: z.string(),
  }),
  execute: async ({ content, research_data }) => {
    console.log(`[Editor] Checking fact accuracy`);
    try {
      // Simulated fact checking
      const factCount = (content.match(/\d+/g) || []).length;
      return {status: "success", facts_checked: factCount, accuracy_score: 95};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const simplifyVocabularyTool = tool({
  description: "Replace complex words with simpler alternatives",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[Editor] Simplifying vocabulary`);
    try {
      // Simple word replacement
      let simplified = content
        .replace(/utilize/gi, "use")
        .replace(/demonstrate/gi, "show")
        .replace(/facilitate/gi, "help");
      return {status: "success", simplified_content: simplified, replacements_made: 3};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

// ============================================================================
// SEO AGENT TOOLS (10 tools)
// ============================================================================

const analyzeKeywordsSerperTool = tool({
  description: "Analyze keywords using Serper API Google search (real SERP data)",
  parameters: z.object({
    topic: z.string(),
  }),
  execute: async ({ topic }) => {
    console.log(`[SEO] Analyzing keywords via Serper for: ${topic}`);
    try {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        return {status: "error", message: "SERPER_API_KEY not set"};
      }
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {"X-API-KEY": apiKey, "Content-Type": "application/json"},
        body: JSON.stringify({q: topic}),
      });
      const data = await response.json();
      const keywords = [topic, ...(data.relatedSearches || []).slice(0, 5).map((s: any) => s.query)];
      return {status: "success", keywords, source: "serper"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const analyzeKeywordsDuckDuckGoTool = tool({
  description: "Analyze keywords via DuckDuckGo search (privacy-focused, different results)",
  parameters: z.object({
    topic: z.string(),
  }),
  execute: async ({ topic }) => {
    console.log(`[SEO] Analyzing keywords via DuckDuckGo`);
    try {
      const keywords = [topic, `${topic} guide`, `${topic} tutorial`];
      return {status: "success", keywords, source: "duckduckgo"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const extractKeywordsNLPTool = tool({
  description: "Local NLP keyword extraction (fast, no API limits)",
  parameters: z.object({
    content: z.string(),
  }),
  execute: async ({ content }) => {
    console.log(`[SEO] Extracting keywords via NLP`);
    try {
      const keywords = extractKeywordsNLP(content, 10);
      return {status: "success", keywords, source: "nlp"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const checkKeywordDensityTool = tool({
  description: "Calculate keyword frequency and density",
  parameters: z.object({
    content: z.string(),
    keyword: z.string(),
  }),
  execute: async ({ content, keyword }) => {
    console.log(`[SEO] Checking keyword density for: ${keyword}`);
    try {
      const density = calculateKeywordDensity(content, keyword);
      return {status: "success", keyword_density: density, optimal: density >= 1 && density <= 3};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const generateMetaTagsShortTool = tool({
  description: "Generate short meta tags (50-60 char titles, 120-140 char descriptions, mobile-optimized)",
  parameters: z.object({
    title: z.string(),
    content: z.string(),
  }),
  execute: async ({ title, content }) => {
    console.log(`[SEO] Generating short meta tags`);
    try {
      const metaTitle = title.substring(0, 60);
      const metaDesc = content.substring(0, 140).trim() + "...";
      return {status: "success", meta_title: metaTitle, meta_description: metaDesc, type: "mobile"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const generateMetaTagsLongTool = tool({
  description: "Generate long meta tags (60-70 char titles, 150-160 char descriptions, desktop-optimized)",
  parameters: z.object({
    title: z.string(),
    content: z.string(),
  }),
  execute: async ({ title, content }) => {
    console.log(`[SEO] Generating long meta tags`);
    try {
      const metaTitle = title.substring(0, 70);
      const metaDesc = content.substring(0, 160).trim() + "...";
      return {status: "success", meta_title: metaTitle, meta_description: metaDesc, type: "desktop"};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const generateOpenGraphTagsTool = tool({
  description: "Generate Open Graph tags for social media sharing",
  parameters: z.object({
    title: z.string(),
    description: z.string(),
  }),
  execute: async ({ title, description }) => {
    console.log(`[SEO] Generating Open Graph tags`);
    try {
      return {
        status: "success",
        og_title: title,
        og_description: description.substring(0, 200),
        og_type: "article",
      };
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const suggestInternalLinksTool = tool({
  description: "Recommend related topics for internal linking",
  parameters: z.object({
    topic: z.string(),
    content: z.string(),
  }),
  execute: async ({ topic, content }) => {
    console.log(`[SEO] Suggesting internal links for: ${topic}`);
    try {
      const keywords = extractKeywordsNLP(content, 5);
      const suggestions = keywords.map(kw => ({
        anchor_text: kw,
        suggested_topic: `Guide to ${kw}`,
      }));
      return {status: "success", suggestions};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const analyzeCompetitorsTool = tool({
  description: "Analyze top-ranking content via Serper API (competitive analysis)",
  parameters: z.object({
    topic: z.string(),
  }),
  execute: async ({ topic }) => {
    console.log(`[SEO] Analyzing competitors for: ${topic}`);
    try {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        return {status: "error", message: "SERPER_API_KEY not set"};
      }
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {"X-API-KEY": apiKey, "Content-Type": "application/json"},
        body: JSON.stringify({q: topic, num: 5}),
      });
      const data = await response.json();
      const competitors = (data.organic || []).slice(0, 3).map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      }));
      return {status: "success", competitors};
    } catch (error: any) {
      return {status: "error", message: error.message};
    }
  },
});

const optimizeHeadingsTool = tool({
  description: "Analyze and optimize H1/H2/H3 heading hierarchy for SEO",
  parameters: z.object({
    content: z.string().describe("The article content to optimize headings for"),
  }),
  execute: async ({ content }) => {
    console.log(`[SEO] Optimizing heading structure`);
    try {
      const headings = content.match(/^#+\s+.+$/gm) || [];
      const h1Count = headings.filter(h => h.startsWith("# ")).length;
      const h2Count = headings.filter(h => h.startsWith("## ")).length;
      const h3Count = headings.filter(h => h.startsWith("### ")).length;
      
      // Extract primary keyword from content for recommendation
      const primaryKeyword = extractKeywordsNLP(content, 1)[0] || "main topic";
      
      const recommendations: string[] = [];
      if (h1Count === 0) recommendations.push("Add an H1 heading");
      if (h1Count > 1) recommendations.push("Use only one H1 heading");
      if (h2Count < 2) recommendations.push("Add more H2 subheadings for structure");
      recommendations.push(`Include "${primaryKeyword}" in H1 and H2 tags`);
      
      return {
        status: "success",
        heading_counts: { h1: h1Count, h2: h2Count, h3: h3Count, total: headings.length },
        primary_keyword: primaryKeyword,
        recommendations,
      };
    } catch (error: any) {
      return { status: "error", message: error.message };
    }
  },
});

// ============================================================================
// TASK HELPER FUNCTIONS (clean, no nesting)
// ============================================================================

const topicAnalysis = (userQuery: string) =>
  Traceloop.withTask({ name: "topic_analysis" }, () =>
    generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: "You are a content strategy orchestrator. Analyze the topic and prepare for content creation." },
        { role: "user", content: `Analyze this content request: ${userQuery}` },
      ],
      tools: {
        analyze_topic_intent_shallow: analyzeTopicIntentShallowTool,
        analyze_topic_intent_deep: analyzeTopicIntentDeepTool,
        validate_topic_feasibility_quick: validateTopicFeasibilityQuickTool,
        validate_topic_feasibility_thorough: validateTopicFeasibilityThoroughTool,
        estimate_complexity: estimateComplexityTool,
        suggest_pipeline_configuration: suggestPipelineConfigurationTool,
      },
      maxSteps: 5,
      experimental_telemetry: { isEnabled: true },
    })
  );

const researchPhase = (userQuery: string, orchestratorResult: string) =>
  Traceloop.withTask({ name: "research_phase" }, () =>
    generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: "You are a research specialist. Gather comprehensive information using available tools." },
        { role: "user", content: `Research this topic thoroughly: ${userQuery}\nOrchestrator analysis: ${orchestratorResult}` },
      ],
      tools: {
        search_news_api: searchNewsAPITool,
        search_news_data: searchNewsDataTool,
        fetch_wikipedia_content: fetchWikipediaContentTool,
        fetch_wikipedia_summary: fetchWikipediaSummaryTool,
        search_duckduckgo: searchDuckDuckGoTool,
        gather_statistics: gatherStatisticsTool,
        fetch_arxiv_papers: fetchArxivPapersTool,
        search_google_scholar: searchGoogleScholarTool,
      },
      maxSteps: 8,
      experimental_telemetry: { isEnabled: true },
    })
  );

const writingPhase = (userQuery: string, researchResult: string) =>
  Traceloop.withTask({ name: "writing_phase" }, () =>
    generateText({
      model: openai("gpt-4o"),
      messages: [
        { role: "system", content: "You are a professional writer. Create a high-quality article draft." },
        { role: "user", content: `Write an article about: ${userQuery}\nResearch: ${researchResult}` },
      ],
      tools: {
        generate_outline_basic: generateOutlineBasicTool,
        generate_outline_detailed: generateOutlineDetailedTool,
        write_draft_short: writeDraftShortTool,
        write_draft_long: writeDraftLongTool,
        write_section_by_section: writeSectionBySectionTool,
        add_citations_inline: addCitationsInlineTool,
        add_citations_bibliography: addCitationsBibliographyTool,
      },
      maxSteps: 7,
      experimental_telemetry: { isEnabled: true },
    })
  );

const editingPhase = (writingResult: string) =>
  Traceloop.withTask({ name: "editing_phase" }, () =>
    generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: "You are an editor. Improve readability, grammar, and clarity." },
        { role: "user", content: `Edit this article:\n${writingResult}` },
      ],
      tools: {
        analyze_readability_flesch: analyzeReadabilityFleschTool,
        analyze_readability_gunning: analyzeReadabilityGunningTool,
        analyze_readability_dale: analyzeReadabilityDALETool,
        check_grammar_basic: checkGrammarBasicTool,
        check_grammar_languagetool: checkGrammarLanguageToolTool,
        improve_clarity_aggressive: improveClarityAggressiveTool,
        improve_clarity_conservative: improveClarityConservativeTool,
        check_fact_accuracy: checkFactAccuracyTool,
        simplify_vocabulary: simplifyVocabularyTool,
      },
      maxSteps: 7,
      experimental_telemetry: { isEnabled: true },
    })
  );

const seoPhase = (editingResult: string) =>
  Traceloop.withTask({ name: "seo_optimization_phase" }, () =>
    generateText({
      model: openai("gpt-4o-mini"),
      messages: [
        { role: "system", content: "You are an SEO specialist. Optimize the article for search engines." },
        { role: "user", content: `Optimize this article for SEO:\n${editingResult}` },
      ],
      tools: {
        analyze_keywords_serper: analyzeKeywordsSerperTool,
        analyze_keywords_duckduckgo: analyzeKeywordsDuckDuckGoTool,
        extract_keywords_nlp: extractKeywordsNLPTool,
        check_keyword_density: checkKeywordDensityTool,
        generate_meta_tags_short: generateMetaTagsShortTool,
        generate_meta_tags_long: generateMetaTagsLongTool,
        generate_open_graph_tags: generateOpenGraphTagsTool,
        suggest_internal_links: suggestInternalLinksTool,
        analyze_competitors: analyzeCompetitorsTool,
        optimize_headings: optimizeHeadingsTool,
      },
      maxSteps: 8,
      experimental_telemetry: { isEnabled: true },
    })
  );

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

async function runContentCreationPipeline(userQuery: string) {
  console.log("=".repeat(80));
  console.log(`Topic Request: ${userQuery}`);
  console.log("=".repeat(80));

  try {
    await Traceloop.withWorkflow({ name: "content_creation_pipeline" }, async () => {
      console.log("\n[PHASE 1: ORCHESTRATOR] Analyzing topic...\n");
      const { text: orchestratorResult } = await topicAnalysis(userQuery);

      console.log("\n[PHASE 2: RESEARCH] Gathering information...\n");
      const { text: researchResult } = await researchPhase(userQuery, orchestratorResult);

      console.log("\n[PHASE 3: WRITING] Drafting article...\n");
      const { text: writingResult } = await writingPhase(userQuery, researchResult);

      console.log("\n[PHASE 4: EDITING] Improving quality...\n");
      const { text: editingResult } = await editingPhase(writingResult);

      console.log("\n[PHASE 5: SEO] Optimizing for search...\n");
      const { text: seoResult } = await seoPhase(editingResult);

      console.log("\n" + "=".repeat(80));
      console.log("✅ Content creation pipeline completed!");
      console.log("=".repeat(80));
      console.log("\nFINAL ARTICLE (SEO-optimized):\n");
      console.log(seoResult);
    });
  } catch (error: any) {
    console.error(`Error in pipeline: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// QUERY GENERATION
// ============================================================================

function generateContentQueries(n: number = 5): string[] {
  const topics = [
    "Recent developments in quantum computing",
    "A beginner's guide to TypeScript decorators",
    "How remote work affects team productivity",
    "The science behind climate change",
    "Understanding machine learning algorithms",
    "The future of electric vehicles",
    "Cybersecurity best practices for small businesses",
    "The impact of social media on mental health",
    "Introduction to blockchain technology",
    "The rise of artificial general intelligence",
    "Sustainable energy solutions for 2026",
    "How to build a successful startup",
  ];

  // Shuffle topics for variety
  const shuffled = [...topics].sort(() => Math.random() - 0.5);

  const queries: string[] = [];
  for (let i = 0; i < n; i++) {
    queries.push(shuffled[i % shuffled.length]);
  }
  return queries;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf("--count");
  const count = countIndex >= 0 ? parseInt(args[countIndex + 1]) || 1 : 1;

  console.log("=".repeat(80));
  console.log("Content Creation Pipeline - AI SDK Agent");
  console.log("=".repeat(80));
  console.log(`Running ${count} content creation queries...`);
  console.log("5 Agents: Orchestrator, Research, Writer, Editor, SEO");
  console.log("40 Tools: 6 + 8 + 7 + 9 + 10");
  console.log("=".repeat(80));

  const queries = generateContentQueries(count);

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n\n${"#".repeat(80)}`);
    console.log(`# Query ${i + 1} of ${count}`);
    console.log(`${"#".repeat(80)}\n`);

    await runContentCreationPipeline(queries[i]);

    if (i < count - 1) {
      console.log(`\nWaiting 2 seconds before next query...`);
    }
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("✅ All content pipeline queries completed!");
  console.log("🔍 All spans captured by OpenTelemetry instrumentation");
  console.log("=".repeat(80));
}

if (require.main === module) {
  main().catch(console.error);
}
