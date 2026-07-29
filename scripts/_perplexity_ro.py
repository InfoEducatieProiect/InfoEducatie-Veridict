from __future__ import annotations

import math
import os
import random
from typing import Optional

_MODEL_NAME = "dumitrescustefan/bert-base-romanian-cased-v1"

_MEAN_THRESHOLD = 3.2
_MEAN_K = 0.8
_STD_THRESHOLD = 1.9
_STD_K = 0.5

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
            input_ids = enc["input_ids"].clone()
            seq_len = input_ids.shape[1]

            maskable = list(range(1, seq_len - 1))
            if not maskable:
                return {"mean_surprisal": None, "stddev_surprisal": None, "scor_perplexitate": None}

            n_mask = max(_MIN_MASKS, int(len(maskable) * _MASK_RATIO))
            rng = random.Random(abs(hash(text)) % (2 ** 32))
            masked_positions = rng.sample(maskable, min(n_mask, len(maskable)))

            true_tokens = input_ids[0, masked_positions].clone()
            masked_input = input_ids.clone()
            masked_input[0, masked_positions] = tokenizer.mask_token_id

            outputs = model(
                input_ids=masked_input,
                attention_mask=enc["attention_mask"],
            )
            log_probs = F.log_softmax(outputs.logits, dim=-1)

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
