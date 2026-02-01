#!/usr/bin/env node

/**
 * AlphaGenome MCP Server
 *
 * This MCP server provides access to Google DeepMind's AlphaGenome API,
 * enabling genomic sequence analysis, variant effect prediction, and
 * regulatory element identification through a unified interface.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from "child_process";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validation schemas using Zod
const DNASequenceSchema = z.string().regex(/^[ATGCN]+$/i, "Sequence must contain only A, T, G, C, N characters");

const GenomicIntervalSchema = z.object({
  chromosome: z.string().min(1, "Chromosome is required"),
  start: z.number().int().min(1, "Start position must be a positive integer"),
  end: z.number().int().min(1, "End position must be a positive integer"),
}).refine(data => data.end > data.start, {
  message: "End position must be greater than start position"
});

const VariantSchema = z.object({
  chromosome: z.string().min(1, "Chromosome is required"),
  position: z.number().int().min(1, "Position must be a positive integer"),
  ref: z.string().regex(/^[ATGC]+$/i, "Reference allele must contain only A, T, G, C"),
  alt: z.string().regex(/^[ATGC]+$/i, "Alternative allele must contain only A, T, G, C"),
});

// API key validation
const API_KEY = process.env.ALPHAGENOME_API_KEY;
if (!API_KEY) {
  console.error("ALPHAGENOME_API_KEY environment variable is required");
  console.error("Please obtain an API key from: https://deepmind.google.com/science/alphagenome");
  process.exit(1);
}

/**
 * Execute Python AlphaGenome client and return parsed JSON result
 */
async function executePythonClient(command: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, "..", "alphagenome_client.py");
    const pythonArgs: string[] = [pythonScript, command, "--api-key", API_KEY!, ...args.filter((arg): arg is string => arg !== undefined)];

    const pythonProcess = spawn("python3.10", pythonArgs, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout?.on("data", (data: any) => {
      stdout += data.toString();
    });

    pythonProcess.stderr?.on("data", (data: any) => {
      stderr += data.toString();
    });

    pythonProcess.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        if (!result.success) {
          reject(new Error(`AlphaGenome API error: ${result.error}`));
          return;
        }
        resolve(result);
      } catch (parseError) {
        reject(new Error(`Failed to parse Python output: ${parseError}\nOutput: ${stdout}`));
      }
    });

    pythonProcess.on("error", (error: Error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });
  });
}

/**
 * Create the MCP server with AlphaGenome capabilities
 */
const server = new Server(
  {
    name: "alphagenome-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List all available AlphaGenome tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "predict_dna_sequence",
        description: "Analyze a DNA sequence to predict genomic features like gene expression, chromatin accessibility, and regulatory elements",
        inputSchema: {
          type: "object",
          properties: {
            sequence: {
              type: "string",
              description: "DNA sequence to analyze (A, T, G, C, N characters only, up to 1M base pairs)",
              pattern: "^[ATGCNatgcn]+$"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional): atac, cage, dnase, histone_marks, gene_expression"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            }
          },
          required: ["sequence"]
        }
      },
      {
        name: "predict_genomic_interval",
        description: "Analyze a genomic interval (chromosome coordinates) to predict regulatory features",
        inputSchema: {
          type: "object",
          properties: {
            chromosome: {
              type: "string",
              description: "Chromosome identifier (e.g., 'chr1', '1', 'X')"
            },
            start: {
              type: "number",
              description: "Start position (1-based coordinates)",
              minimum: 1
            },
            end: {
              type: "number",
              description: "End position (1-based coordinates)",
              minimum: 1
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            }
          },
          required: ["chromosome", "start", "end"]
        }
      },
      {
        name: "predict_variant_effect",
        description: "Predict the functional effect of a genetic variant on regulatory elements and gene expression",
        inputSchema: {
          type: "object",
          properties: {
            chromosome: {
              type: "string",
              description: "Chromosome where the variant is located"
            },
            position: {
              type: "number",
              description: "Position of the variant (1-based coordinates)",
              minimum: 1
            },
            ref: {
              type: "string",
              description: "Reference allele (A, T, G, C)",
              pattern: "^[ATGCatgc]+$"
            },
            alt: {
              type: "string",
              description: "Alternative allele (A, T, G, C)",
              pattern: "^[ATGCatgc]+$"
            },
            interval_start: {
              type: "number",
              description: "Start of analysis interval around the variant",
              minimum: 1
            },
            interval_end: {
              type: "number",
              description: "End of analysis interval around the variant",
              minimum: 1
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            }
          },
          required: ["chromosome", "position", "ref", "alt", "interval_start", "interval_end"]
        }
      },
      {
        name: "score_variant",
        description: "Generate quantitative scores for a genetic variant using multiple scoring algorithms",
        inputSchema: {
          type: "object",
          properties: {
            chromosome: {
              type: "string",
              description: "Chromosome where the variant is located"
            },
            position: {
              type: "number",
              description: "Position of the variant (1-based coordinates)",
              minimum: 1
            },
            ref: {
              type: "string",
              description: "Reference allele (A, T, G, C)",
              pattern: "^[ATGCatgc]+$"
            },
            alt: {
              type: "string",
              description: "Alternative allele (A, T, G, C)",
              pattern: "^[ATGCatgc]+$"
            },
            interval_start: {
              type: "number",
              description: "Start of analysis interval around the variant",
              minimum: 1
            },
            interval_end: {
              type: "number",
              description: "End of analysis interval around the variant",
              minimum: 1
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            }
          },
          required: ["chromosome", "position", "ref", "alt", "interval_start", "interval_end"]
        }
      },
      {
        name: "get_output_metadata",
        description: "Get information about available output types and capabilities for a given organism",
        inputSchema: {
          type: "object",
          properties: {
            organism: {
              type: "string",
              description: "Target organism",
              enum: ["human"],
              default: "human"
            }
          }
        }
      },
      // Batch processing tools
      {
        name: "predict_sequences",
        description: "Analyze multiple DNA sequences in batch to predict genomic features",
        inputSchema: {
          type: "object",
          properties: {
            sequences: {
              type: "array",
              items: { type: "string", pattern: "^[ATGCNatgcn]+$" },
              description: "Array of DNA sequences to analyze"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["sequences"]
        }
      },
      {
        name: "predict_intervals",
        description: "Analyze multiple genomic intervals in batch to predict regulatory features",
        inputSchema: {
          type: "object",
          properties: {
            intervals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  start: { type: "number", minimum: 1 },
                  end: { type: "number", minimum: 1 }
                },
                required: ["chromosome", "start", "end"]
              },
              description: "Array of genomic intervals to analyze"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["intervals"]
        }
      },
      {
        name: "predict_variants",
        description: "Predict the effects of multiple genetic variants in batch",
        inputSchema: {
          type: "object",
          properties: {
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  position: { type: "number", minimum: 1 },
                  ref: { type: "string", pattern: "^[ATGCatgc]+$" },
                  alt: { type: "string", pattern: "^[ATGCatgc]+$" }
                },
                required: ["chromosome", "position", "ref", "alt"]
              },
              description: "Array of genetic variants to analyze"
            },
            interval: {
              type: "object",
              properties: {
                chromosome: { type: "string" },
                start: { type: "number", minimum: 1 },
                end: { type: "number", minimum: 1 }
              },
              required: ["chromosome", "start", "end"],
              description: "Analysis interval for all variants"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            },
            ontology_terms: {
              type: "array",
              items: { type: "string" },
              description: "Specific ontology terms to analyze (optional)"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["variants", "interval"]
        }
      },
      {
        name: "score_variants",
        description: "Score multiple genetic variants in batch using recommended scorers",
        inputSchema: {
          type: "object",
          properties: {
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  position: { type: "number", minimum: 1 },
                  ref: { type: "string", pattern: "^[ATGCatgc]+$" },
                  alt: { type: "string", pattern: "^[ATGCatgc]+$" }
                },
                required: ["chromosome", "position", "ref", "alt"]
              },
              description: "Array of genetic variants to score"
            },
            interval: {
              type: "object",
              properties: {
                chromosome: { type: "string" },
                start: { type: "number", minimum: 1 },
                end: { type: "number", minimum: 1 }
              },
              required: ["chromosome", "start", "end"],
              description: "Analysis interval for all variants"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["variants", "interval"]
        }
      },
      {
        name: "score_interval",
        description: "Score a genomic interval using interval scorers",
        inputSchema: {
          type: "object",
          properties: {
            chromosome: {
              type: "string",
              description: "Chromosome identifier"
            },
            start: {
              type: "number",
              description: "Start position (1-based coordinates)",
              minimum: 1
            },
            end: {
              type: "number",
              description: "End position (1-based coordinates)",
              minimum: 1
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            }
          },
          required: ["chromosome", "start", "end"]
        }
      },
      {
        name: "score_intervals",
        description: "Score multiple genomic intervals in batch using interval scorers",
        inputSchema: {
          type: "object",
          properties: {
            intervals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  start: { type: "number", minimum: 1 },
                  end: { type: "number", minimum: 1 }
                },
                required: ["chromosome", "start", "end"]
              },
              description: "Array of genomic intervals to score"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["intervals"]
        }
      },
      {
        name: "score_ism_variants",
        description: "Score in-silico mutagenesis variants within an interval",
        inputSchema: {
          type: "object",
          properties: {
            chromosome: {
              type: "string",
              description: "Chromosome identifier for analysis interval"
            },
            start: {
              type: "number",
              description: "Start position of analysis interval",
              minimum: 1
            },
            end: {
              type: "number",
              description: "End position of analysis interval",
              minimum: 1
            },
            ism_chromosome: {
              type: "string",
              description: "Chromosome identifier for ISM interval"
            },
            ism_start: {
              type: "number",
              description: "Start position of ISM interval",
              minimum: 1
            },
            ism_end: {
              type: "number",
              description: "End position of ISM interval",
              minimum: 1
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["chromosome", "start", "end", "ism_chromosome", "ism_start", "ism_end"]
        }
      },
      // Utility tools
      {
        name: "parse_variant_string",
        description: "Parse a variant string in various formats (GNOMAD, GTEx, OpenTargets, etc.) into structured components",
        inputSchema: {
          type: "object",
          properties: {
            variant_string: {
              type: "string",
              description: "Variant string to parse (e.g., 'chr1-1001000-A-G', 'chr1:1001000:A:G')"
            },
            variant_format: {
              type: "string",
              description: "Format of the variant string",
              enum: ["default", "gnomad", "gtex", "open_targets", "open_targets_bigquery"],
              default: "default"
            }
          },
          required: ["variant_string"]
        }
      },
      {
        name: "validate_genomic_data",
        description: "Validate sequences, intervals, and variants for correctness before analysis",
        inputSchema: {
          type: "object",
          properties: {
            data_type: {
              type: "string",
              description: "Type of genomic data to validate",
              enum: ["sequence", "interval", "variant"]
            },
            data: {
              type: "object",
              description: "Data to validate (structure depends on data_type)"
            }
          },
          required: ["data_type", "data"]
        }
      },
      {
        name: "get_supported_outputs",
        description: "Get all supported output types, sequence lengths, and API capabilities",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "calculate_genomic_overlap",
        description: "Calculate overlap between two genomic intervals including intersection and overlap percentages",
        inputSchema: {
          type: "object",
          properties: {
            interval1: {
              type: "object",
              properties: {
                chromosome: { type: "string" },
                start: { type: "number", minimum: 1 },
                end: { type: "number", minimum: 1 }
              },
              required: ["chromosome", "start", "end"],
              description: "First genomic interval"
            },
            interval2: {
              type: "object",
              properties: {
                chromosome: { type: "string" },
                start: { type: "number", minimum: 1 },
                end: { type: "number", minimum: 1 }
              },
              required: ["chromosome", "start", "end"],
              description: "Second genomic interval"
            }
          },
          required: ["interval1", "interval2"]
        }
      },
      {
        name: "get_sequence_info",
        description: "Get detailed statistics about a DNA sequence including GC content, base counts, and validation",
        inputSchema: {
          type: "object",
          properties: {
            sequence: {
              type: "string",
              description: "DNA sequence to analyze",
              pattern: "^[ATGCNatgcn]+$"
            }
          },
          required: ["sequence"]
        }
      },
      {
        name: "analyze_gene_region",
        description: "Analyze regulatory elements around a specific gene (requires gene coordinate lookup from external database)",
        inputSchema: {
          type: "object",
          properties: {
            gene_symbol: {
              type: "string",
              description: "Gene symbol (e.g., BRCA1, TP53)"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            flanking_size: {
              type: "number",
              description: "Size of flanking regions to include (default: 10000 bp)",
              default: 10000,
              minimum: 0
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            }
          },
          required: ["gene_symbol"]
        }
      },
      {
        name: "compare_sequences",
        description: "Compare regulatory predictions between two DNA sequences to identify differences",
        inputSchema: {
          type: "object",
          properties: {
            sequence1: {
              type: "string",
              description: "First DNA sequence to compare",
              pattern: "^[ATGCNatgcn]+$"
            },
            sequence2: {
              type: "string",
              description: "Second DNA sequence to compare",
              pattern: "^[ATGCNatgcn]+$"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            output_types: {
              type: "array",
              items: { type: "string" },
              description: "Specific output types to request (optional)"
            }
          },
          required: ["sequence1", "sequence2"]
        }
      },
      {
        name: "rank_variants_by_impact",
        description: "Rank multiple variants by predicted functional impact using scoring algorithms",
        inputSchema: {
          type: "object",
          properties: {
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  position: { type: "number", minimum: 1 },
                  ref: { type: "string", pattern: "^[ATGCatgc]+$" },
                  alt: { type: "string", pattern: "^[ATGCatgc]+$" }
                },
                required: ["chromosome", "position", "ref", "alt"]
              },
              description: "Array of genetic variants to rank"
            },
            interval: {
              type: "object",
              properties: {
                chromosome: { type: "string" },
                start: { type: "number", minimum: 1 },
                end: { type: "number", minimum: 1 }
              },
              required: ["chromosome", "start", "end"],
              description: "Analysis interval for all variants"
            },
            organism: {
              type: "string",
              description: "Target organism for analysis",
              enum: ["human"],
              default: "human"
            },
            ranking_metric: {
              type: "string",
              description: "Metric to use for ranking variants",
              default: "composite"
            },
            max_workers: {
              type: "number",
              description: "Maximum number of parallel workers",
              default: 5,
              minimum: 1,
              maximum: 10
            }
          },
          required: ["variants", "interval"]
        }
      }
    ]
  };
});

/**
 * Handle tool execution requests
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "predict_dna_sequence": {
        // Validate input
        const sequence = String(args?.sequence || "");
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;

        // Validate sequence
        DNASequenceSchema.parse(sequence);

        // Check sequence length (1M base pairs limit)
        if (sequence.length > 1000000) {
          throw new Error("Sequence length exceeds 1M base pairs limit");
        }

        // Build Python command arguments
        const pythonArgs = ["--sequence", sequence, "--organism", organism];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_sequence", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome DNA Sequence Analysis Results:

Sequence Length: ${result.sequence_length} base pairs
Organism: ${organism}

Prediction Results:
${JSON.stringify(result.result, null, 2)}

This analysis provides predictions for various genomic features including:
- Gene expression patterns
- Chromatin accessibility (ATAC-seq)
- Transcription start sites (CAGE)
- DNase hypersensitivity
- Histone modifications
- Contact maps and 3D structure`
            }
          ]
        };
      }

      case "predict_genomic_interval": {
        const chromosome = String(args?.chromosome || "");
        const start = Number(args?.start);
        const end = Number(args?.end);
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;

        // Validate interval
        GenomicIntervalSchema.parse({ chromosome, start, end });

        // Check interval size (1M base pairs limit)
        if (end - start > 1000000) {
          throw new Error("Interval size exceeds 1M base pairs limit");
        }

        const pythonArgs = [
          "--chromosome", chromosome,
          "--start", start.toString(),
          "--end", end.toString(),
          "--organism", organism
        ];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_interval", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Genomic Interval Analysis Results:

Interval: ${result.interval}
Organism: ${organism}
Size: ${end - start + 1} base pairs

Prediction Results:
${JSON.stringify(result.result, null, 2)}

This analysis provides regulatory predictions for the specified genomic region.`
            }
          ]
        };
      }

      case "predict_variant_effect": {
        const chromosome = String(args?.chromosome || "");
        const position = Number(args?.position);
        const ref = String(args?.ref || "");
        const alt = String(args?.alt || "");
        const intervalStart = Number(args?.interval_start);
        const intervalEnd = Number(args?.interval_end);
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;

        // Validate inputs
        VariantSchema.parse({ chromosome, position, ref, alt });
        GenomicIntervalSchema.parse({ chromosome, start: intervalStart, end: intervalEnd });

        const pythonArgs = [
          "--chromosome", chromosome,
          "--position", position.toString(),
          "--ref", ref,
          "--alt", alt,
          "--interval-start", intervalStart.toString(),
          "--interval-end", intervalEnd.toString(),
          "--organism", organism
        ];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_variant", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Variant Effect Prediction Results:

Variant: ${result.variant}
Analysis Interval: ${result.interval}
Organism: ${organism}

Prediction Results:
${JSON.stringify(result.result, null, 2)}

This analysis compares the reference and alternative alleles to predict
the functional impact of the variant on regulatory elements and gene expression.`
            }
          ]
        };
      }

      case "score_variant": {
        const chromosome = String(args?.chromosome || "");
        const position = Number(args?.position);
        const ref = String(args?.ref || "");
        const alt = String(args?.alt || "");
        const intervalStart = Number(args?.interval_start);
        const intervalEnd = Number(args?.interval_end);
        const organism = String(args?.organism || "human");

        // Validate inputs
        VariantSchema.parse({ chromosome, position, ref, alt });
        GenomicIntervalSchema.parse({ chromosome, start: intervalStart, end: intervalEnd });

        const pythonArgs = [
          "--chromosome", chromosome,
          "--position", position.toString(),
          "--ref", ref,
          "--alt", alt,
          "--interval-start", intervalStart.toString(),
          "--interval-end", intervalEnd.toString(),
          "--organism", organism
        ];

        const result = await executePythonClient("score_variant", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Variant Scoring Results:

Variant: ${result.variant}
Analysis Interval: ${result.interval}
Organism: ${organism}

Scoring Results:
${JSON.stringify(result.result, null, 2)}

These scores quantify the predicted functional impact of the variant
using multiple scoring algorithms optimized for different regulatory elements.`
            }
          ]
        };
      }

      case "get_output_metadata": {
        const organism = String(args?.organism || "human");

        const pythonArgs = ["--organism", organism];
        const result = await executePythonClient("get_metadata", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Output Metadata:

Organism: ${result.organism}

Available Output Types:
${JSON.stringify(result.result, null, 2)}

This metadata describes the types of genomic predictions available
for the specified organism, including data types and resolution information.`
            }
          ]
        };
      }

      case "predict_sequences": {
        const sequences = args?.sequences as string[] || [];
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate sequences
        if (!sequences.length) {
          throw new Error("At least one sequence is required");
        }

        sequences.forEach((seq, i) => {
          try {
            DNASequenceSchema.parse(seq);
          } catch (e) {
            throw new Error(`Invalid sequence at index ${i}: ${e}`);
          }
        });

        const pythonArgs = ["--sequences", JSON.stringify(sequences), "--organism", organism, "--max-workers", maxWorkers.toString()];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_sequences", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Batch Sequence Analysis Results:

Sequences Analyzed: ${result.sequence_count}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Batch Results:
${JSON.stringify(result.results, null, 2)}

This batch analysis provides predictions for multiple DNA sequences simultaneously.`
            }
          ]
        };
      }

      case "predict_intervals": {
        const intervals = args?.intervals as Array<{chromosome: string, start: number, end: number}> || [];
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate intervals
        if (!intervals.length) {
          throw new Error("At least one interval is required");
        }

        intervals.forEach((interval, i) => {
          try {
            GenomicIntervalSchema.parse(interval);
          } catch (e) {
            throw new Error(`Invalid interval at index ${i}: ${e}`);
          }
        });

        const pythonArgs = ["--intervals", JSON.stringify(intervals), "--organism", organism, "--max-workers", maxWorkers.toString()];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_intervals", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Batch Interval Analysis Results:

Intervals Analyzed: ${result.interval_count}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Batch Results:
${JSON.stringify(result.results, null, 2)}

This batch analysis provides regulatory predictions for multiple genomic intervals simultaneously.`
            }
          ]
        };
      }

      case "predict_variants": {
        const variants = args?.variants as Array<{chromosome: string, position: number, ref: string, alt: string}> || [];
        const interval = args?.interval as {chromosome: string, start: number, end: number};
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;
        const ontologyTerms = args?.ontology_terms as string[] | undefined;
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate variants and interval
        if (!variants.length) {
          throw new Error("At least one variant is required");
        }
        if (!interval) {
          throw new Error("Analysis interval is required");
        }

        variants.forEach((variant, i) => {
          try {
            VariantSchema.parse(variant);
          } catch (e) {
            throw new Error(`Invalid variant at index ${i}: ${e}`);
          }
        });
        GenomicIntervalSchema.parse(interval);

        const pythonArgs = [
          "--variants", JSON.stringify(variants),
          "--interval", JSON.stringify(interval),
          "--organism", organism,
          "--max-workers", maxWorkers.toString()
        ];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }
        if (ontologyTerms && ontologyTerms.length > 0) {
          pythonArgs.push("--ontology-terms", ...ontologyTerms);
        }

        const result = await executePythonClient("predict_variants", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Batch Variant Effect Prediction Results:

Variants Analyzed: ${result.variant_count}
Analysis Interval: ${result.interval}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Batch Results:
${JSON.stringify(result.results, null, 2)}

This batch analysis predicts the functional effects of multiple genetic variants simultaneously.`
            }
          ]
        };
      }

      case "score_variants": {
        const variants = args?.variants as Array<{chromosome: string, position: number, ref: string, alt: string}> || [];
        const interval = args?.interval as {chromosome: string, start: number, end: number};
        const organism = String(args?.organism || "human");
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate variants and interval
        if (!variants.length) {
          throw new Error("At least one variant is required");
        }
        if (!interval) {
          throw new Error("Analysis interval is required");
        }

        variants.forEach((variant, i) => {
          try {
            VariantSchema.parse(variant);
          } catch (e) {
            throw new Error(`Invalid variant at index ${i}: ${e}`);
          }
        });
        GenomicIntervalSchema.parse(interval);

        const pythonArgs = [
          "--variants", JSON.stringify(variants),
          "--interval", JSON.stringify(interval),
          "--organism", organism,
          "--max-workers", maxWorkers.toString()
        ];

        const result = await executePythonClient("score_variants", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Batch Variant Scoring Results:

Variants Scored: ${result.variant_count}
Analysis Interval: ${result.interval}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Batch Scoring Results:
${JSON.stringify(result.results, null, 2)}

These scores quantify the predicted functional impact of multiple variants
using recommended scoring algorithms optimized for different regulatory elements.`
            }
          ]
        };
      }

      case "score_interval": {
        const chromosome = String(args?.chromosome || "");
        const start = Number(args?.start);
        const end = Number(args?.end);
        const organism = String(args?.organism || "human");

        // Validate interval
        GenomicIntervalSchema.parse({ chromosome, start, end });

        const pythonArgs = [
          "--chromosome", chromosome,
          "--start", start.toString(),
          "--end", end.toString(),
          "--organism", organism
        ];

        const result = await executePythonClient("score_interval", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Interval Scoring Results:

Interval: ${result.interval}
Organism: ${organism}

Scoring Results:
${JSON.stringify(result.results, null, 2)}

These scores quantify the regulatory potential of the genomic interval
using specialized interval scoring algorithms.`
            }
          ]
        };
      }

      case "score_intervals": {
        const intervals = args?.intervals as Array<{chromosome: string, start: number, end: number}> || [];
        const organism = String(args?.organism || "human");
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate intervals
        if (!intervals.length) {
          throw new Error("At least one interval is required");
        }

        intervals.forEach((interval, i) => {
          try {
            GenomicIntervalSchema.parse(interval);
          } catch (e) {
            throw new Error(`Invalid interval at index ${i}: ${e}`);
          }
        });

        const pythonArgs = [
          "--intervals", JSON.stringify(intervals),
          "--organism", organism,
          "--max-workers", maxWorkers.toString()
        ];

        const result = await executePythonClient("score_intervals", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Batch Interval Scoring Results:

Intervals Scored: ${result.interval_count}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Batch Scoring Results:
${JSON.stringify(result.results, null, 2)}

These scores quantify the regulatory potential of multiple genomic intervals
using specialized interval scoring algorithms.`
            }
          ]
        };
      }

      case "score_ism_variants": {
        const chromosome = String(args?.chromosome || "");
        const start = Number(args?.start);
        const end = Number(args?.end);
        const ismChromosome = String(args?.ism_chromosome || "");
        const ismStart = Number(args?.ism_start);
        const ismEnd = Number(args?.ism_end);
        const organism = String(args?.organism || "human");
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate intervals
        GenomicIntervalSchema.parse({ chromosome, start, end });
        GenomicIntervalSchema.parse({ chromosome: ismChromosome, start: ismStart, end: ismEnd });

        // Check ISM interval width (max 10 bp)
        if (ismEnd - ismStart > 10) {
          throw new Error("ISM interval width exceeds 10 base pairs limit");
        }

        const pythonArgs = [
          "--chromosome", chromosome,
          "--start", start.toString(),
          "--end", end.toString(),
          "--ism-chromosome", ismChromosome,
          "--ism-start", ismStart.toString(),
          "--ism-end", ismEnd.toString(),
          "--organism", organism,
          "--max-workers", maxWorkers.toString()
        ];

        const result = await executePythonClient("score_ism_variants", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome In-Silico Mutagenesis Scoring Results:

Analysis Interval: ${result.interval}
ISM Interval: ${result.ism_interval}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

ISM Scoring Results:
${JSON.stringify(result.results, null, 2)}

This analysis scores all possible single nucleotide variants within the ISM interval
to identify positions with high regulatory impact.`
            }
          ]
        };
      }

      case "parse_variant_string": {
        const variantString = String(args?.variant_string || "");
        const variantFormat = String(args?.variant_format || "default");

        if (!variantString) {
          throw new Error("Variant string is required");
        }

        const pythonArgs = ["--variant-string", variantString, "--variant-format", variantFormat];
        const result = await executePythonClient("parse_variant_string", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `Variant String Parsing Results:

Original String: ${result.original_string}
Format: ${variantFormat}

Parsed Components:
${JSON.stringify(result.result, null, 2)}

The variant string has been successfully parsed into structured components.`
            }
          ]
        };
      }

      case "validate_genomic_data": {
        const dataType = String(args?.data_type || "");
        const data = args?.data as Record<string, any>;

        if (!dataType || !data) {
          throw new Error("Both data_type and data are required");
        }

        const pythonArgs = ["--data-type", dataType, "--data", JSON.stringify(data)];
        const result = await executePythonClient("validate_genomic_data", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `Genomic Data Validation Results:

Data Type: ${result.data_type}

Validation Results:
${JSON.stringify(result.result, null, 2)}

${result.result.valid ? "✅ Data is valid" : "❌ Data validation failed"}
${result.result.warnings?.length > 0 ? `\nWarnings:\n${result.result.warnings.join('\n')}` : ""}
${result.result.errors?.length > 0 ? `\nErrors:\n${result.result.errors.join('\n')}` : ""}`
            }
          ]
        };
      }

      case "get_supported_outputs": {
        const result = await executePythonClient("get_supported_outputs", []);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Supported Outputs and Capabilities:

${JSON.stringify(result.result, null, 2)}

This information includes:
- Available output types (ATAC, CAGE, DNase, etc.)
- Supported sequence lengths (2KB, 16KB, 100KB, 500KB, 1MB)
- Maximum ISM interval width (10 base pairs)
- Supported organisms
- Variant string formats`
            }
          ]
        };
      }

      case "calculate_genomic_overlap": {
        const interval1 = args?.interval1 as {chromosome: string, start: number, end: number};
        const interval2 = args?.interval2 as {chromosome: string, start: number, end: number};

        if (!interval1 || !interval2) {
          throw new Error("Both interval1 and interval2 are required");
        }

        // Validate intervals
        GenomicIntervalSchema.parse(interval1);
        GenomicIntervalSchema.parse(interval2);

        const pythonArgs = [
          "--interval1", JSON.stringify(interval1),
          "--interval2", JSON.stringify(interval2)
        ];
        const result = await executePythonClient("calculate_genomic_overlap", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `Genomic Interval Overlap Analysis:

${JSON.stringify(result.result, null, 2)}

${result.result.overlaps ? "✅ Intervals overlap" : "❌ Intervals do not overlap"}
${result.result.intersection ? `\nIntersection: ${result.result.intersection.chromosome}:${result.result.intersection.start}-${result.result.intersection.end} (${result.result.intersection.length} bp)` : ""}
${result.result.overlap_stats ? `\nOverlap: ${result.result.overlap_stats.overlap_percentage_int1.toFixed(2)}% of interval1, ${result.result.overlap_stats.overlap_percentage_int2.toFixed(2)}% of interval2` : ""}`
            }
          ]
        };
      }

      case "get_sequence_info": {
        const sequence = String(args?.sequence || "");

        if (!sequence) {
          throw new Error("Sequence is required");
        }

        // Validate sequence
        DNASequenceSchema.parse(sequence);

        const pythonArgs = ["--sequence", sequence];
        const result = await executePythonClient("get_sequence_info", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `DNA Sequence Information:

${JSON.stringify(result.result, null, 2)}

Sequence Statistics:
- Length: ${result.result.length} base pairs
- GC Content: ${result.result.gc_content}%
- AT Content: ${result.result.at_content}%
- N Content: ${result.result.n_content}%
- Valid: ${result.result.is_valid ? "✅ Yes" : "❌ No"}
- Supported Length: ${result.result.is_supported_length ? "✅ Yes" : `❌ No (closest: ${result.result.closest_supported_length} bp)`}`
            }
          ]
        };
      }

      case "analyze_gene_region": {
        const geneSymbol = String(args?.gene_symbol || "");
        const organism = String(args?.organism || "human");
        const flankingSize = Number(args?.flanking_size || 10000);
        const outputTypes = args?.output_types as string[] | undefined;

        if (!geneSymbol) {
          throw new Error("Gene symbol is required");
        }

        const pythonArgs = [
          "--gene-symbol", geneSymbol,
          "--organism", organism,
          "--flanking-size", flankingSize.toString()
        ];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }

        const result = await executePythonClient("analyze_gene_region", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Gene Region Analysis:

Gene Symbol: ${geneSymbol}
Organism: ${organism}
Flanking Size: ${flankingSize} bp

${result.success ? "Analysis Results:" : "Note:"}
${JSON.stringify(result, null, 2)}

${!result.success && result.suggestion ? `\n💡 Suggestion: ${result.suggestion}` : ""}`
            }
          ]
        };
      }

      case "compare_sequences": {
        const sequence1 = String(args?.sequence1 || "");
        const sequence2 = String(args?.sequence2 || "");
        const organism = String(args?.organism || "human");
        const outputTypes = args?.output_types as string[] | undefined;

        if (!sequence1 || !sequence2) {
          throw new Error("Both sequence1 and sequence2 are required");
        }

        // Validate sequences
        DNASequenceSchema.parse(sequence1);
        DNASequenceSchema.parse(sequence2);

        const pythonArgs = [
          "--sequence1", sequence1,
          "--sequence2", sequence2,
          "--organism", organism
        ];
        if (outputTypes && outputTypes.length > 0) {
          pythonArgs.push("--output-types", ...outputTypes);
        }

        const result = await executePythonClient("compare_sequences", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Sequence Comparison Results:

Organism: ${organism}

Comparison Results:
${JSON.stringify(result.result, null, 2)}

This analysis compares regulatory predictions between two DNA sequences:
- Sequence 1: ${result.result?.sequence1?.length || 0} bp
- Sequence 2: ${result.result?.sequence2?.length || 0} bp
- Length Difference: ${result.result?.comparison?.length_difference || 0} bp`
            }
          ]
        };
      }

      case "rank_variants_by_impact": {
        const variants = args?.variants as Array<{chromosome: string, position: number, ref: string, alt: string}> || [];
        const interval = args?.interval as {chromosome: string, start: number, end: number};
        const organism = String(args?.organism || "human");
        const rankingMetric = String(args?.ranking_metric || "composite");
        const maxWorkers = Number(args?.max_workers || 5);

        // Validate variants and interval
        if (!variants.length) {
          throw new Error("At least one variant is required");
        }
        if (!interval) {
          throw new Error("Analysis interval is required");
        }

        variants.forEach((variant, i) => {
          try {
            VariantSchema.parse(variant);
          } catch (e) {
            throw new Error(`Invalid variant at index ${i}: ${e}`);
          }
        });
        GenomicIntervalSchema.parse(interval);

        const pythonArgs = [
          "--variants", JSON.stringify(variants),
          "--interval", JSON.stringify(interval),
          "--organism", organism,
          "--ranking-metric", rankingMetric,
          "--max-workers", maxWorkers.toString()
        ];

        const result = await executePythonClient("rank_variants_by_impact", pythonArgs);

        return {
          content: [
            {
              type: "text",
              text: `AlphaGenome Variant Impact Ranking Results:

Total Variants: ${result.result?.total_variants || 0}
Analysis Interval: ${result.result?.interval || "N/A"}
Ranking Metric: ${rankingMetric}
Organism: ${organism}
Parallel Workers: ${maxWorkers}

Ranked Variants:
${JSON.stringify(result.result?.ranked_variants || [], null, 2)}

${result.result?.note ? `\n📝 Note: ${result.result.note}` : ""}

This analysis ranks variants by their predicted functional impact using
AlphaGenome's scoring algorithms to identify the most impactful variants.`
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Validation error: ${error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      `AlphaGenome API error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Start the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AlphaGenome MCP server running on stdio");
}

// Error handling
server.onerror = (error) => console.error("[MCP Error]", error);
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
