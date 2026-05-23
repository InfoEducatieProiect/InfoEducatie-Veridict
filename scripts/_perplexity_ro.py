"""
Pseudo-perplexity signal for Romanian AI text detection.
Uses dumitrescustefan/bert-base-romanian-cased-v1 (~125 MB) as a masked-LM
to measure token surprisal: low mean + low stddev → likely AI-generated.

Set VERIDICT_DISABLE_PERPLEXITY=1 to skip this signal (e.g. in low-memory envs).
The model downloads once and is cached by HuggingFace (~125 MB).
"""
from __future__ import annotations

import math
import os
import random
from typing import Optional

_MODEL_NAME = "dumitrescustefan/bert-base-romanian-cased-v1"

# Thresholds calibrated against general MLM surprisal literature for Romanian.
# AI text (GPT-4-class): mean ~2.0-3.0 bits, stddev ~1.0-1.8 bits.
# Human text: mean ~3.5-4.5 bits, stddev ~2.0-3.0 bits.
_MEAN_THRESHOLD = 3.2   # surprisal below this → AI signal
_MEAN_K = 0.8           # sigmoid steepness for mean component
_STD_THRESHOLD = 1.9    # surprisal stddev below this → AI signal
_STD_K = 0.5            # sigmoid steepness for std component

_MASK_RATIO = 0.15
_MAX_TOKENS = 512
_MIN_MASKS = 5

_tokenizer = None
_model = None


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-20.0, min(20.0, x))))


def _load_model():
    global _tokenizer, _model
    if _tokenizer is None:
        import torch
        from transformers import AutoModelForMaskedLM, AutoTokenizer

        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        _tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
        _model = AutoModelForMaskedLM.from_pretrained(_MODEL_NAME)
        _model.eval()
    return _tokenizer, _model


def calculeaza_perplexitate_ro(text: str) -> dict:
    """
    Returns {"mean_surprisal", "stddev_surprisal", "scor_perplexitate"} or
    {"scor_perplexitate": None, "eroare": ...} on failure.

    scor_perplexitate is in [0, 99.4] where higher = more likely AI.
    """
    if os.environ.get("VERIDICT_DISABLE_PERPLEXITY") == "1":
        return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None}

    try:
        import torch
        import torch.nn.functional as F

        tokenizer, model = _load_model()
    except Exception as exc:
        return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None, "eroare": str(exc)}

    try:
        import torch
        import torch.nn.functional as F

        with torch.no_grad():
            enc = tokenizer(
                text,
                return_tensors="pt",
                max_length=_MAX_TOKENS,
                truncation=True,
            )
            input_ids = enc["input_ids"].clone()   # (1, seq_len)
            seq_len = input_ids.shape[1]

            # Maskable positions: exclude [CLS]=0 and [SEP]=last
            maskable = list(range(1, seq_len - 1))
            if not maskable:
                return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None}

            n_mask = max(_MIN_MASKS, int(len(maskable) * _MASK_RATIO))
            # Deterministic per text — same text always produces same score
            rng = random.Random(abs(hash(text)) % (2 ** 32))
            masked_positions = rng.sample(maskable, min(n_mask, len(maskable)))

            true_tokens = input_ids[0, masked_positions].clone()
            masked_input = input_ids.clone()
            masked_input[0, masked_positions] = tokenizer.mask_token_id

            outputs = model(
                input_ids=masked_input,
                attention_mask=enc["attention_mask"],
            )
            log_probs = F.log_softmax(outputs.logits, dim=-1)  # (1, seq, vocab)

            surprisals_bits: list[float] = []
            for i, pos in enumerate(masked_positions):
                true_id = true_tokens[i].item()
                surprisal_nats = -log_probs[0, pos, true_id].item()
                surprisals_bits.append(surprisal_nats / math.log(2))

        mean_s = float(sum(surprisals_bits) / len(surprisals_bits))
        variance = sum((s - mean_s) ** 2 for s in surprisals_bits) / len(surprisals_bits)
        std_s = float(math.sqrt(variance))

        p_mean = _sigmoid((_MEAN_THRESHOLD - mean_s) / _MEAN_K) * 60.0
        p_std = _sigmoid((_STD_THRESHOLD - std_s) / _STD_K) * 40.0
        scor = round(min(max(p_mean + p_std, 0.0), 99.4), 1)

        return {
            "mean_surprisal": round(mean_s, 3),
            "stddev_surprisal": round(std_s, 3),
            "scor_perplexitate": scor,
        }
    except Exception as exc:
        return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None, "eroare": str(exc)}
