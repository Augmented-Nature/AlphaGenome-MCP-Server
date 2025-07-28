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
    
    const pythonProcess = spawn("python3.11", pythonArgs, {
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
