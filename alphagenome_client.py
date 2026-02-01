#!/usr/bin/env python3
"""
AlphaGenome API client wrapper for MCP server integration.
This script provides a command-line interface to the AlphaGenome API.
"""

import json
import sys
import os
import argparse
from typing import Dict, List, Any, Optional

try:
    import alphagenome
    from alphagenome.models.dna_client import create, Organism, ModelVersion
    from alphagenome.models.dna_output import OutputType
    from alphagenome.data.genome import Interval, Variant, VariantFormat, Junction, Sequence
    from alphagenome.data.ontology import OntologyTerm, OntologyType
except ImportError as e:
    print(json.dumps({
        "error": f"AlphaGenome package not installed: {e}. Please install with: pip install alphagenome",
        "type": "import_error"
    }))
    sys.exit(1)


class AlphaGenomeClient:
    def __init__(self, api_key: str):
        """Initialize the AlphaGenome client with API key."""
        if not api_key:
            raise ValueError("API key is required")

        self.client = create(api_key=api_key)

    def predict_sequence(self, sequence: str, organism: str = "human",
                        output_types: Optional[List[str]] = None,
                        ontology_terms: Optional[List[str]] = None) -> Dict[str, Any]:
        """Predict genomic features for a DNA sequence."""
        try:
            # Validate sequence
            if not sequence or not isinstance(sequence, str):
                raise ValueError("Sequence must be a non-empty string")

            # Check for valid DNA characters
            valid_chars = set('ATGCN')
            if not set(sequence.upper()).issubset(valid_chars):
                raise ValueError("Sequence contains invalid characters. Only A, T, G, C, N are allowed")

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make prediction
            result = self.client.predict_sequence(
                sequence=sequence.upper(),
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms
            )

            return {
                "success": True,
                "result": self._serialize_output(result),
                "sequence_length": len(sequence)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def predict_interval(self, chromosome: str, start: int, end: int,
                        organism: str = "human",
                        output_types: Optional[List[str]] = None,
                        ontology_terms: Optional[List[str]] = None) -> Dict[str, Any]:
        """Predict genomic features for a genomic interval."""
        try:
            # Create interval object
            interval = Interval(chromosome=chromosome, start=start, end=end)

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make prediction
            result = self.client.predict_interval(
                interval=interval,
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms
            )

            return {
                "success": True,
                "result": self._serialize_output(result),
                "interval": f"{chromosome}:{start}-{end}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def predict_variant(self, chromosome: str, position: int, ref: str, alt: str,
                       interval_start: int, interval_end: int,
                       organism: str = "human",
                       output_types: Optional[List[str]] = None,
                       ontology_terms: Optional[List[str]] = None) -> Dict[str, Any]:
        """Predict the effect of a genetic variant."""
        try:
            # Create interval and variant objects
            interval = Interval(chromosome=chromosome, start=interval_start, end=interval_end)
            variant = Variant(chromosome=chromosome, position=position, reference_bases=ref, alternate_bases=alt)

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make prediction
            result = self.client.predict_variant(
                interval=interval,
                variant=variant,
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms
            )

            return {
                "success": True,
                "result": self._serialize_output(result),
                "variant": f"{chromosome}:{position}{ref}>{alt}",
                "interval": f"{chromosome}:{interval_start}-{interval_end}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def score_variant(self, chromosome: str, position: int, ref: str, alt: str,
                     interval_start: int, interval_end: int,
                     organism: str = "human") -> Dict[str, Any]:
        """Score a genetic variant using recommended scorers."""
        try:
            # Create interval and variant objects
            interval = Interval(chromosome=chromosome, start=interval_start, end=interval_end)
            variant = Variant(chromosome=chromosome, position=position, reference_bases=ref, alternate_bases=alt)

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Score variant
            result = self.client.score_variant(
                interval=interval,
                variant=variant,
                organism=organism_enum
            )

            return {
                "success": True,
                "result": self._serialize_scores(result),
                "variant": f"{chromosome}:{position}{ref}>{alt}",
                "interval": f"{chromosome}:{interval_start}-{interval_end}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def get_output_metadata(self, organism: str = "human") -> Dict[str, Any]:
        """Get metadata about available outputs for an organism."""
        try:
            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Get metadata
            metadata = self.client.output_metadata(organism=organism_enum)

            return {
                "success": True,
                "result": self._serialize_metadata(metadata),
                "organism": organism
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def predict_sequences(self, sequences: List[str], organism: str = "human",
                         output_types: Optional[List[str]] = None,
                         ontology_terms: Optional[List[str]] = None,
                         max_workers: int = 5) -> Dict[str, Any]:
        """Predict genomic features for multiple DNA sequences."""
        try:
            # Validate sequences
            if not sequences or not isinstance(sequences, list):
                raise ValueError("Sequences must be a non-empty list")

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make predictions
            results = self.client.predict_sequences(
                sequences=[seq.upper() for seq in sequences],
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_output(result) for result in results],
                "sequence_count": len(sequences)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def predict_intervals(self, intervals: List[Dict[str, Any]], organism: str = "human",
                         output_types: Optional[List[str]] = None,
                         ontology_terms: Optional[List[str]] = None,
                         max_workers: int = 5) -> Dict[str, Any]:
        """Predict genomic features for multiple genomic intervals."""
        try:
            # Create interval objects
            interval_objs = []
            for interval_data in intervals:
                interval_objs.append(Interval(
                    chromosome=interval_data["chromosome"],
                    start=interval_data["start"],
                    end=interval_data["end"]
                ))

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make predictions
            results = self.client.predict_intervals(
                intervals=interval_objs,
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_output(result) for result in results],
                "interval_count": len(intervals)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def predict_variants(self, variants: List[Dict[str, Any]], interval: Dict[str, Any],
                        organism: str = "human",
                        output_types: Optional[List[str]] = None,
                        ontology_terms: Optional[List[str]] = None,
                        max_workers: int = 5) -> Dict[str, Any]:
        """Predict the effects of multiple genetic variants."""
        try:
            # Create interval object
            interval_obj = Interval(
                chromosome=interval["chromosome"],
                start=interval["start"],
                end=interval["end"]
            )

            # Create variant objects
            variant_objs = []
            for variant_data in variants:
                variant_objs.append(Variant(
                    chromosome=variant_data["chromosome"],
                    position=variant_data["position"],
                    reference_bases=variant_data["ref"],
                    alternate_bases=variant_data["alt"]
                ))

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Convert output types if provided
            requested_outputs = None
            if output_types:
                requested_outputs = [getattr(OutputType, ot.upper()) for ot in output_types if hasattr(OutputType, ot.upper())]

            # Make predictions
            results = self.client.predict_variants(
                intervals=interval_obj,
                variants=variant_objs,
                organism=organism_enum,
                requested_outputs=requested_outputs,
                ontology_terms=ontology_terms,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_variant_output(result) for result in results],
                "variant_count": len(variants),
                "interval": f"{interval['chromosome']}:{interval['start']}-{interval['end']}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def score_variants(self, variants: List[Dict[str, Any]], interval: Dict[str, Any],
                      organism: str = "human", max_workers: int = 5) -> Dict[str, Any]:
        """Score multiple genetic variants using recommended scorers."""
        try:
            # Create interval object
            interval_obj = Interval(
                chromosome=interval["chromosome"],
                start=interval["start"],
                end=interval["end"]
            )

            # Create variant objects
            variant_objs = []
            for variant_data in variants:
                variant_objs.append(Variant(
                    chromosome=variant_data["chromosome"],
                    position=variant_data["position"],
                    reference_bases=variant_data["ref"],
                    alternate_bases=variant_data["alt"]
                ))

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Score variants
            results = self.client.score_variants(
                intervals=interval_obj,
                variants=variant_objs,
                organism=organism_enum,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_scores(result) for result in results],
                "variant_count": len(variants),
                "interval": f"{interval['chromosome']}:{interval['start']}-{interval['end']}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def score_interval(self, chromosome: str, start: int, end: int,
                      organism: str = "human") -> Dict[str, Any]:
        """Score a genomic interval using interval scorers."""
        try:
            # Create interval object
            interval = Interval(chromosome=chromosome, start=start, end=end)

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Score interval with empty interval_scorers list to use defaults
            results = self.client.score_interval(
                interval=interval,
                interval_scorers=[],  # Use default scorers
                organism=organism_enum
            )

            return {
                "success": True,
                "results": self._serialize_scores(results),
                "interval": f"{chromosome}:{start}-{end}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def score_intervals(self, intervals: List[Dict[str, Any]], organism: str = "human",
                       max_workers: int = 5) -> Dict[str, Any]:
        """Score multiple genomic intervals using interval scorers."""
        try:
            # Create interval objects
            interval_objs = []
            for interval_data in intervals:
                interval_objs.append(Interval(
                    chromosome=interval_data["chromosome"],
                    start=interval_data["start"],
                    end=interval_data["end"]
                ))

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Score intervals with empty interval_scorers list to use defaults
            results = self.client.score_intervals(
                intervals=interval_objs,
                interval_scorers=[],  # Use default scorers
                organism=organism_enum,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_scores(result) for result in results],
                "interval_count": len(intervals)
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def score_ism_variants(self, chromosome: str, start: int, end: int,
                          ism_chromosome: str, ism_start: int, ism_end: int,
                          organism: str = "human", max_workers: int = 5) -> Dict[str, Any]:
        """Score in-silico mutagenesis variants within an interval."""
        try:
            # Create interval objects
            interval = Interval(chromosome=chromosome, start=start, end=end)
            ism_interval = Interval(chromosome=ism_chromosome, start=ism_start, end=ism_end)

            # Convert organism string to enum
            organism_enum = Organism.HOMO_SAPIENS if organism.lower() in ['human', 'homo_sapiens'] else Organism.HOMO_SAPIENS

            # Score ISM variants
            results = self.client.score_ism_variants(
                interval=interval,
                ism_interval=ism_interval,
                organism=organism_enum,
                max_workers=max_workers
            )

            return {
                "success": True,
                "results": [self._serialize_scores(result) for result in results],
                "interval": f"{chromosome}:{start}-{end}",
                "ism_interval": f"{ism_chromosome}:{ism_start}-{ism_end}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    # Utility and validation tools
    def parse_variant_string(self, variant_string: str, variant_format: str = "default") -> Dict[str, Any]:
        """Parse a variant string in different formats (GNOMAD, GTEx, OpenTargets, etc.)."""
        try:
            # For now, let's create a simple parser that handles basic formats
            # since the AlphaGenome Variant.from_str might have specific format requirements

            # Try to parse common formats manually
            if "-" in variant_string:
                # Format: chr1-1001000-A-G
                parts = variant_string.split("-")
                if len(parts) == 4:
                    chromosome, position, ref, alt = parts
                    return {
                        "success": True,
                        "result": {
                            "chromosome": chromosome,
                            "position": int(position),
                            "reference_bases": ref,
                            "alternate_bases": alt,
                            "name": variant_string,
                            "parsed_format": variant_format
                        },
                        "original_string": variant_string
                    }
            elif ":" in variant_string:
                # Format: chr1:1001000:A:G
                parts = variant_string.split(":")
                if len(parts) == 4:
                    chromosome, position, ref, alt = parts
                    return {
                        "success": True,
                        "result": {
                            "chromosome": chromosome,
                            "position": int(position),
                            "reference_bases": ref,
                            "alternate_bases": alt,
                            "name": variant_string,
                            "parsed_format": variant_format
                        },
                        "original_string": variant_string
                    }

            # If manual parsing fails, try AlphaGenome's parser
            format_map = {
                "default": VariantFormat.DEFAULT,
                "gnomad": VariantFormat.GNOMAD,
                "gtex": VariantFormat.GTEX,
                "open_targets": VariantFormat.OPEN_TARGETS,
                "open_targets_bigquery": VariantFormat.OPEN_TARGETS_BIGQUERY
            }

            format_enum = format_map.get(variant_format.lower(), VariantFormat.DEFAULT)
            variant = Variant.from_str(variant_string, variant_format=format_enum)

            return {
                "success": True,
                "result": {
                    "chromosome": variant.chromosome,
                    "position": variant.position,
                    "reference_bases": variant.reference_bases,
                    "alternate_bases": variant.alternate_bases,
                    "name": variant.name,
                    "parsed_format": variant_format
                },
                "original_string": variant_string
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def validate_genomic_data(self, data_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate sequences, intervals, and variants for correctness."""
        try:
            validation_results = {
                "valid": True,
                "warnings": [],
                "errors": []
            }

            if data_type == "sequence":
                sequence = data.get("sequence", "")
                if not sequence:
                    validation_results["errors"].append("Sequence is empty")
                    validation_results["valid"] = False
                else:
                    # Check for valid DNA characters
                    valid_chars = set('ATGCN')
                    invalid_chars = set(sequence.upper()) - valid_chars
                    if invalid_chars:
                        validation_results["errors"].append(f"Invalid characters found: {invalid_chars}")
                        validation_results["valid"] = False

                    # Check sequence length against supported lengths
                    supported_lengths = [2048, 16384, 131072, 524288, 1048576]
                    if len(sequence) not in supported_lengths:
                        validation_results["warnings"].append(f"Sequence length {len(sequence)} not in supported lengths: {supported_lengths}")

            elif data_type == "interval":
                chromosome = data.get("chromosome", "")
                start = data.get("start")
                end = data.get("end")

                if not chromosome:
                    validation_results["errors"].append("Chromosome is required")
                    validation_results["valid"] = False

                if start is None or end is None:
                    validation_results["errors"].append("Start and end positions are required")
                    validation_results["valid"] = False
                elif start >= end:
                    validation_results["errors"].append("End position must be greater than start position")
                    validation_results["valid"] = False
                elif start < 1:
                    validation_results["errors"].append("Start position must be positive")
                    validation_results["valid"] = False

            elif data_type == "variant":
                chromosome = data.get("chromosome", "")
                position = data.get("position")
                ref = data.get("ref", "")
                alt = data.get("alt", "")

                if not chromosome:
                    validation_results["errors"].append("Chromosome is required")
                    validation_results["valid"] = False

                if position is None or position < 1:
                    validation_results["errors"].append("Position must be a positive integer")
                    validation_results["valid"] = False

                if not ref or not alt:
                    validation_results["errors"].append("Reference and alternate alleles are required")
                    validation_results["valid"] = False
                else:
                    # Check for valid DNA characters
                    valid_chars = set('ATGC')
                    if not set(ref.upper()).issubset(valid_chars):
                        validation_results["errors"].append("Reference allele contains invalid characters")
                        validation_results["valid"] = False
                    if not set(alt.upper()).issubset(valid_chars):
                        validation_results["errors"].append("Alternate allele contains invalid characters")
                        validation_results["valid"] = False

            return {
                "success": True,
                "result": validation_results,
                "data_type": data_type
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def get_supported_outputs(self) -> Dict[str, Any]:
        """Get all supported output types with descriptions."""
        try:
            output_types = {
                "ATAC": "ATAC-seq chromatin accessibility data",
                "CAGE": "CAGE transcription start site data",
                "CHIP_HISTONE": "ChIP-seq histone modification data",
                "CHIP_TF": "ChIP-seq transcription factor binding data",
                "CONTACT_MAPS": "3D chromatin contact maps",
                "DNASE": "DNase hypersensitivity data",
                "PROCAP": "PRO-cap nascent transcription data",
                "RNA_SEQ": "RNA-seq gene expression data",
                "SPLICE_JUNCTIONS": "Splice junction predictions",
                "SPLICE_SITES": "Splice site predictions",
                "SPLICE_SITE_USAGE": "Splice site usage predictions"
            }

            # Get supported sequence lengths
            supported_lengths = {
                "SEQUENCE_LENGTH_2KB": 2048,
                "SEQUENCE_LENGTH_16KB": 16384,
                "SEQUENCE_LENGTH_100KB": 131072,
                "SEQUENCE_LENGTH_500KB": 524288,
                "SEQUENCE_LENGTH_1MB": 1048576
            }

            return {
                "success": True,
                "result": {
                    "output_types": output_types,
                    "supported_sequence_lengths": supported_lengths,
                    "max_ism_interval_width": 10,
                    "max_variant_scorers_per_request": 20,
                    "supported_organisms": ["human"],
                    "variant_formats": ["default", "gnomad", "gtex", "open_targets", "open_targets_bigquery"]
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def calculate_genomic_overlap(self, interval1: Dict[str, Any], interval2: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overlap between two genomic intervals."""
        try:
            # Create interval objects
            int1 = Interval(
                chromosome=interval1["chromosome"],
                start=interval1["start"],
                end=interval1["end"]
            )
            int2 = Interval(
                chromosome=interval2["chromosome"],
                start=interval2["start"],
                end=interval2["end"]
            )

            # Check if they overlap
            overlaps = int1.overlaps(int2)

            result = {
                "overlaps": overlaps,
                "interval1": f"{interval1['chromosome']}:{interval1['start']}-{interval1['end']}",
                "interval2": f"{interval2['chromosome']}:{interval2['start']}-{interval2['end']}"
            }

            if overlaps:
                # Calculate intersection
                intersection = int1.intersect(int2)
                if intersection:
                    result["intersection"] = {
                        "chromosome": intersection.chromosome,
                        "start": intersection.start,
                        "end": intersection.end,
                        "length": intersection.end - intersection.start + 1
                    }

                    # Calculate overlap percentage
                    int1_length = int1.end - int1.start + 1
                    int2_length = int2.end - int2.start + 1
                    overlap_length = intersection.end - intersection.start + 1

                    result["overlap_stats"] = {
                        "overlap_length": overlap_length,
                        "interval1_length": int1_length,
                        "interval2_length": int2_length,
                        "overlap_percentage_int1": (overlap_length / int1_length) * 100,
                        "overlap_percentage_int2": (overlap_length / int2_length) * 100
                    }

            return {
                "success": True,
                "result": result
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def get_sequence_info(self, sequence: str) -> Dict[str, Any]:
        """Get detailed information about a DNA sequence."""
        try:
            if not sequence:
                raise ValueError("Sequence cannot be empty")

            sequence = sequence.upper()

            # Basic sequence statistics
            length = len(sequence)
            base_counts = {
                'A': sequence.count('A'),
                'T': sequence.count('T'),
                'G': sequence.count('G'),
                'C': sequence.count('C'),
                'N': sequence.count('N')
            }

            # Calculate GC content
            gc_count = base_counts['G'] + base_counts['C']
            at_count = base_counts['A'] + base_counts['T']
            known_bases = gc_count + at_count

            gc_content = (gc_count / known_bases * 100) if known_bases > 0 else 0

            # Check if sequence length is supported
            supported_lengths = [2048, 16384, 131072, 524288, 1048576]
            is_supported_length = length in supported_lengths

            # Find closest supported length
            closest_length = min(supported_lengths, key=lambda x: abs(x - length))

            # Validate sequence characters
            valid_chars = set('ATGCN')
            invalid_chars = set(sequence) - valid_chars
            is_valid = len(invalid_chars) == 0

            return {
                "success": True,
                "result": {
                    "length": length,
                    "base_counts": base_counts,
                    "gc_content": round(gc_content, 2),
                    "at_content": round(100 - gc_content, 2),
                    "n_content": round((base_counts['N'] / length * 100), 2),
                    "is_valid": is_valid,
                    "invalid_characters": list(invalid_chars) if invalid_chars else [],
                    "is_supported_length": is_supported_length,
                    "closest_supported_length": closest_length,
                    "supported_lengths": supported_lengths
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def analyze_gene_region(self, gene_symbol: str, organism: str = "human",
                           flanking_size: int = 10000,
                           output_types: Optional[List[str]] = None) -> Dict[str, Any]:
        """Analyze regulatory elements around a specific gene."""
        try:
            # Note: This requires gene coordinate lookup from external database
            # For now, return a placeholder that explains the requirement
            return {
                "success": False,
                "error": "Gene coordinate lookup requires integration with Ensembl/UCSC API. Please provide chromosome coordinates directly using predict_genomic_interval.",
                "type": "NotImplementedError",
                "suggestion": "Use predict_genomic_interval with gene coordinates from Ensembl: https://rest.ensembl.org/"
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def compare_sequences(self, sequence1: str, sequence2: str,
                         organism: str = "human",
                         output_types: Optional[List[str]] = None) -> Dict[str, Any]:
        """Compare regulatory predictions between two DNA sequences."""
        try:
            # Predict both sequences
            result1 = self.predict_sequence(sequence1, organism, output_types)
            result2 = self.predict_sequence(sequence2, organism, output_types)

            if not result1["success"] or not result2["success"]:
                return {
                    "success": False,
                    "error": "Failed to predict one or both sequences",
                    "result1": result1,
                    "result2": result2
                }

            return {
                "success": True,
                "result": {
                    "sequence1": {
                        "length": len(sequence1),
                        "predictions": result1["result"]
                    },
                    "sequence2": {
                        "length": len(sequence2),
                        "predictions": result2["result"]
                    },
                    "comparison": {
                        "length_difference": abs(len(sequence1) - len(sequence2)),
                        "note": "Detailed differential analysis requires post-processing of prediction outputs"
                    }
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def rank_variants_by_impact(self, variants: List[Dict[str, Any]],
                                interval: Dict[str, Any],
                                organism: str = "human",
                                ranking_metric: str = "composite",
                                max_workers: int = 5) -> Dict[str, Any]:
        """Rank multiple variants by predicted functional impact."""
        try:
            # Score all variants
            score_result = self.score_variants(variants, interval, organism, max_workers)

            if not score_result["success"]:
                return score_result

            # Create ranked list with variant information
            ranked_variants = []
            for i, variant in enumerate(variants):
                variant_info = {
                    "rank": i + 1,  # Will be re-ranked after scoring
                    "variant": f"{variant['chromosome']}:{variant['position']}{variant['ref']}>{variant['alt']}",
                    "chromosome": variant["chromosome"],
                    "position": variant["position"],
                    "ref": variant["ref"],
                    "alt": variant["alt"],
                    "scores": score_result["results"][i] if i < len(score_result["results"]) else None,
                    "impact_category": "unknown"  # Will be determined from scores
                }
                ranked_variants.append(variant_info)

            # Note: Actual ranking would require parsing the score data
            # For now, return variants with their scores
            return {
                "success": True,
                "result": {
                    "ranked_variants": ranked_variants,
                    "total_variants": len(variants),
                    "ranking_metric": ranking_metric,
                    "interval": f"{interval['chromosome']}:{interval['start']}-{interval['end']}",
                    "note": "Variants are returned with scores. Detailed ranking requires score interpretation based on specific algorithms."
                }
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "type": type(e).__name__
            }

    def _serialize_output(self, output) -> Dict[str, Any]:
        """Serialize AlphaGenome output to JSON-compatible format."""
        try:
            # This is a simplified serialization - in practice, you'd want to
            # handle the specific data structures returned by AlphaGenome
            result = {
                "type": "prediction_output",
                "data": {}
            }

            # Handle different output types
            if hasattr(output, 'atac') and output.atac is not None:
                result["data"]["atac"] = "ATAC-seq data available"
            if hasattr(output, 'cage') and output.cage is not None:
                result["data"]["cage"] = "CAGE data available"
            if hasattr(output, 'dnase') and output.dnase is not None:
                result["data"]["dnase"] = "DNase data available"
            if hasattr(output, 'histone_marks') and output.histone_marks is not None:
                result["data"]["histone_marks"] = "Histone marks data available"
            if hasattr(output, 'gene_expression') and output.gene_expression is not None:
                result["data"]["gene_expression"] = "Gene expression data available"

            return result

        except Exception as e:
            return {"error": f"Serialization failed: {str(e)}"}

    def _serialize_scores(self, scores) -> Dict[str, Any]:
        """Serialize AlphaGenome scores to JSON-compatible format."""
        try:
            result = {
                "type": "variant_scores",
                "scores": []
            }

            # Handle AnnData objects or lists of scores
            if isinstance(scores, list):
                for i, score in enumerate(scores):
                    result["scores"].append({
                        "scorer_index": i,
                        "data": "Score data available (AnnData format)"
                    })

            return result

        except Exception as e:
            return {"error": f"Score serialization failed: {str(e)}"}

    def _serialize_variant_output(self, output) -> Dict[str, Any]:
        """Serialize AlphaGenome variant output to JSON-compatible format."""
        try:
            result = {
                "type": "variant_prediction_output",
                "data": {}
            }

            # Handle variant-specific output types
            if hasattr(output, 'reference') and output.reference is not None:
                result["data"]["reference"] = "Reference prediction data available"
            if hasattr(output, 'alternate') and output.alternate is not None:
                result["data"]["alternate"] = "Alternate prediction data available"
            if hasattr(output, 'difference') and output.difference is not None:
                result["data"]["difference"] = "Difference prediction data available"

            return result

        except Exception as e:
            return {"error": f"Variant output serialization failed: {str(e)}"}

    def _serialize_metadata(self, metadata) -> Dict[str, Any]:
        """Serialize AlphaGenome metadata to JSON-compatible format."""
        try:
            result = {
                "type": "output_metadata",
                "available_outputs": []
            }

            # Extract available output types
            if hasattr(metadata, 'atac') and metadata.atac is not None:
                result["available_outputs"].append("atac")
            if hasattr(metadata, 'cage') and metadata.cage is not None:
                result["available_outputs"].append("cage")
            if hasattr(metadata, 'dnase') and metadata.dnase is not None:
                result["available_outputs"].append("dnase")
            if hasattr(metadata, 'histone_marks') and metadata.histone_marks is not None:
                result["available_outputs"].append("histone_marks")
            if hasattr(metadata, 'gene_expression') and metadata.gene_expression is not None:
                result["available_outputs"].append("gene_expression")

            return result

        except Exception as e:
            return {"error": f"Metadata serialization failed: {str(e)}"}


def main():
    parser = argparse.ArgumentParser(description="AlphaGenome API client")
    parser.add_argument("command", choices=[
        "predict_sequence", "predict_interval", "predict_variant",
        "score_variant", "get_metadata", "predict_sequences", "predict_intervals",
        "predict_variants", "score_variants", "score_interval", "score_intervals",
        "score_ism_variants", "parse_variant_string", "validate_genomic_data",
        "get_supported_outputs", "calculate_genomic_overlap", "get_sequence_info",
        "analyze_gene_region", "compare_sequences", "rank_variants_by_impact"
    ])
    parser.add_argument("--api-key", required=True, help="AlphaGenome API key")
    parser.add_argument("--sequence", help="DNA sequence")
    parser.add_argument("--chromosome", help="Chromosome")
    parser.add_argument("--start", type=int, help="Start position")
    parser.add_argument("--end", type=int, help="End position")
    parser.add_argument("--position", type=int, help="Variant position")
    parser.add_argument("--ref", help="Reference allele")
    parser.add_argument("--alt", help="Alternative allele")
    parser.add_argument("--interval-start", type=int, help="Interval start for variant")
    parser.add_argument("--interval-end", type=int, help="Interval end for variant")
    parser.add_argument("--organism", default="human", help="Organism")
    parser.add_argument("--output-types", nargs="*", help="Output types to request")
    parser.add_argument("--ontology-terms", nargs="*", help="Ontology terms")
    # Batch processing arguments
    parser.add_argument("--sequences", help="JSON array of sequences for batch processing")
    parser.add_argument("--intervals", help="JSON array of intervals for batch processing")
    parser.add_argument("--variants", help="JSON array of variants for batch processing")
    parser.add_argument("--interval", help="JSON object for analysis interval")
    parser.add_argument("--max-workers", type=int, default=5, help="Maximum number of parallel workers")
    # ISM-specific arguments
    parser.add_argument("--ism-chromosome", help="ISM chromosome")
    parser.add_argument("--ism-start", type=int, help="ISM start position")
    parser.add_argument("--ism-end", type=int, help="ISM end position")
    # New tool arguments
    parser.add_argument("--gene-symbol", help="Gene symbol for gene region analysis")
    parser.add_argument("--flanking-size", type=int, default=10000, help="Flanking region size for gene analysis")
    parser.add_argument("--sequence1", help="First sequence for comparison")
    parser.add_argument("--sequence2", help="Second sequence for comparison")
    parser.add_argument("--ranking-metric", default="composite", help="Metric for variant ranking")

    args = parser.parse_args()

    try:
        client = AlphaGenomeClient(args.api_key)

        if args.command == "predict_sequence":
            if not args.sequence:
                raise ValueError("--sequence is required for predict_sequence")
            result = client.predict_sequence(
                args.sequence, args.organism, args.output_types, args.ontology_terms
            )
        elif args.command == "predict_interval":
            if not all([args.chromosome, args.start is not None, args.end is not None]):
                raise ValueError("--chromosome, --start, and --end are required for predict_interval")
            result = client.predict_interval(
                args.chromosome, args.start, args.end, args.organism,
                args.output_types, args.ontology_terms
            )
        elif args.command == "predict_variant":
            required_args = [args.chromosome, args.position, args.ref, args.alt,
                           args.interval_start, args.interval_end]
            if not all(arg is not None for arg in required_args):
                raise ValueError("All variant and interval parameters are required for predict_variant")
            result = client.predict_variant(
                args.chromosome, args.position, args.ref, args.alt,
                args.interval_start, args.interval_end, args.organism,
                args.output_types, args.ontology_terms
            )
        elif args.command == "score_variant":
            required_args = [args.chromosome, args.position, args.ref, args.alt,
                           args.interval_start, args.interval_end]
            if not all(arg is not None for arg in required_args):
                raise ValueError("All variant and interval parameters are required for score_variant")
            result = client.score_variant(
                args.chromosome, args.position, args.ref, args.alt,
                args.interval_start, args.interval_end, args.organism
            )
        elif args.command == "get_metadata":
            result = client.get_output_metadata(args.organism)
        elif args.command == "predict_sequences":
            if not args.sequences:
                raise ValueError("--sequences is required for predict_sequences")
            sequences = json.loads(args.sequences)
            result = client.predict_sequences(
                sequences, args.organism, args.output_types, args.ontology_terms, args.max_workers
            )
        elif args.command == "predict_intervals":
            if not args.intervals:
                raise ValueError("--intervals is required for predict_intervals")
            intervals = json.loads(args.intervals)
            result = client.predict_intervals(
                intervals, args.organism, args.output_types, args.ontology_terms, args.max_workers
            )
        elif args.command == "predict_variants":
            if not args.variants or not args.interval:
                raise ValueError("--variants and --interval are required for predict_variants")
            variants = json.loads(args.variants)
            interval = json.loads(args.interval)
            result = client.predict_variants(
                variants, interval, args.organism, args.output_types, args.ontology_terms, args.max_workers
            )
        elif args.command == "score_variants":
            if not args.variants or not args.interval:
                raise ValueError("--variants and --interval are required for score_variants")
            variants = json.loads(args.variants)
            interval = json.loads(args.interval)
            result = client.score_variants(variants, interval, args.organism, args.max_workers)
        elif args.command == "score_interval":
            if not all([args.chromosome, args.start is not None, args.end is not None]):
                raise ValueError("--chromosome, --start, and --end are required for score_interval")
            result = client.score_interval(args.chromosome, args.start, args.end, args.organism)
        elif args.command == "score_intervals":
            if not args.intervals:
                raise ValueError("--intervals is required for score_intervals")
            intervals = json.loads(args.intervals)
            result = client.score_intervals(intervals, args.organism, args.max_workers)
        elif args.command == "score_ism_variants":
            if not all([args.chromosome, args.start is not None, args.end is not None,
                       args.ism_chromosome, args.ism_start is not None, args.ism_end is not None]):
                raise ValueError("All interval and ISM parameters are required for score_ism_variants")
            result = client.score_ism_variants(
                args.chromosome, args.start, args.end,
                args.ism_chromosome, args.ism_start, args.ism_end, args.organism, args.max_workers
            )
        elif args.command == "parse_variant_string":
            if not args.variant_string:
                raise ValueError("--variant-string is required for parse_variant_string")
            result = client.parse_variant_string(args.variant_string, args.variant_format or "default")
        elif args.command == "validate_genomic_data":
            if not args.data_type or not args.data:
                raise ValueError("--data-type and --data are required for validate_genomic_data")
            data = json.loads(args.data)
            result = client.validate_genomic_data(args.data_type, data)
        elif args.command == "get_supported_outputs":
            result = client.get_supported_outputs()
        elif args.command == "calculate_genomic_overlap":
            if not args.interval1 or not args.interval2:
                raise ValueError("--interval1 and --interval2 are required for calculate_genomic_overlap")
            interval1 = json.loads(args.interval1)
            interval2 = json.loads(args.interval2)
            result = client.calculate_genomic_overlap(interval1, interval2)
        elif args.command == "get_sequence_info":
            if not args.sequence:
                raise ValueError("--sequence is required for get_sequence_info")
            result = client.get_sequence_info(args.sequence)
        elif args.command == "analyze_gene_region":
            if not args.gene_symbol:
                raise ValueError("--gene-symbol is required for analyze_gene_region")
            result = client.analyze_gene_region(
                args.gene_symbol, args.organism, args.flanking_size, args.output_types
            )
        elif args.command == "compare_sequences":
            if not args.sequence1 or not args.sequence2:
                raise ValueError("--sequence1 and --sequence2 are required for compare_sequences")
            result = client.compare_sequences(
                args.sequence1, args.sequence2, args.organism, args.output_types
            )
        elif args.command == "rank_variants_by_impact":
            if not args.variants or not args.interval:
                raise ValueError("--variants and --interval are required for rank_variants_by_impact")
            variants = json.loads(args.variants)
            interval = json.loads(args.interval)
            result = client.rank_variants_by_impact(
                variants, interval, args.organism, args.ranking_metric, args.max_workers
            )
        else:
            raise ValueError(f"Unknown command: {args.command}")

        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "type": type(e).__name__
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
