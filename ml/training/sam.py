"""
Sharpness-Aware Minimization (SAM) optimizer.

Wraps any base PyTorch optimizer. Finds flatter minima by perturbing weights
in the direction of the gradient before computing the real update step, which
improves generalization — especially useful when training on small or noisy
class samples (e.g. newly promoted ghost classes with limited community labels).

Usage:
    base = torch.optim.SGD
    optimizer = SAM(model.parameters(), base, rho=0.05,
                    lr=0.01, momentum=0.9, weight_decay=1e-4, nesterov=True)

    # Training loop:
    loss = criterion(model(imgs), labels)
    loss.backward()
    optimizer.first_step(zero_grad=True)

    criterion(model(imgs), labels).backward()   # second forward pass at perturbed weights
    optimizer.second_step(zero_grad=True)

    scheduler.step()

Reference: Foret et al. "Sharpness-Aware Minimization for Efficiently Improving
Generalization" (ICLR 2021) — https://arxiv.org/abs/2010.01412
"""

import torch


class SAM(torch.optim.Optimizer):
    def __init__(self, params, base_optimizer, rho: float = 0.05, adaptive: bool = False, **kwargs):
        assert rho >= 0.0, f"Invalid rho: {rho}"
        defaults = dict(rho=rho, adaptive=adaptive, **kwargs)
        super().__init__(params, defaults)
        self.base_optimizer = base_optimizer(self.param_groups, **kwargs)
        self.param_groups = self.base_optimizer.param_groups
        self.defaults.update(self.base_optimizer.defaults)

    @torch.no_grad()
    def first_step(self, zero_grad: bool = False) -> None:
        """Perturb weights toward the sharpest local loss direction."""
        grad_norm = self._grad_norm()
        for group in self.param_groups:
            scale = group["rho"] / (grad_norm + 1e-12)
            for p in group["params"]:
                if p.grad is None:
                    continue
                self.state[p]["old_p"] = p.data.clone()
                e_w = (torch.pow(p, 2) if group["adaptive"] else 1.0) * p.grad * scale.to(p)
                p.add_(e_w)
        if zero_grad:
            self.zero_grad()

    @torch.no_grad()
    def second_step(self, zero_grad: bool = False) -> None:
        """Restore original weights and apply the base optimizer update."""
        for group in self.param_groups:
            for p in group["params"]:
                if p.grad is None:
                    continue
                p.data = self.state[p]["old_p"]
        self.base_optimizer.step()
        if zero_grad:
            self.zero_grad()

    @torch.no_grad()
    def step(self, closure=None):  # type: ignore[override]
        assert closure is not None, "SAM.step() requires a closure for the second forward pass"
        closure = torch.enable_grad()(closure)
        self.first_step(zero_grad=True)
        closure()
        self.second_step()

    def _grad_norm(self) -> torch.Tensor:
        device = self.param_groups[0]["params"][0].device
        norms = [
            ((torch.abs(p) if group["adaptive"] else 1.0) * p.grad).norm(p=2).to(device)
            for group in self.param_groups
            for p in group["params"]
            if p.grad is not None
        ]
        return torch.norm(torch.stack(norms), p=2)

    def load_state_dict(self, state_dict: dict) -> None:  # type: ignore[override]
        super().load_state_dict(state_dict)
        self.base_optimizer.param_groups = self.param_groups
