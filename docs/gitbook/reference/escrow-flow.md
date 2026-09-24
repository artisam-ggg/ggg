# Escrow Flow and Evidence Map

This diagram summarizes the escrow paths described by the public contract source and the evidence boundary for this milestone record.

```mermaid
flowchart TD
    A[Organizer configures tournament] --> B[One deploy-and-constructor transaction]
    B --> C[Escrow contract instance]
    C --> D[Player joins and pays entry fee]
    D --> E{Tournament outcome}
    E -->|Referee finalizes winners| F[Contract distributes payouts]
    E -->|Organizer cancels| G[Registered player claims refund]
    E -->|Deadline passes while active| H[Registered player claims deadline refund]

    I[Testnet WASM uploads recorded] -. code artifact only .-> B
    J[Local contract and app regression records] -. behavior coverage .-> D
    J -. behavior coverage .-> F
    J -. behavior coverage .-> H
    K[Final SDK-backed Testnet run recorded] -. live transaction proof .-> C
    K -. live transaction proof .-> F
    K -. live transaction proof .-> G
    K -. live transaction proof .-> H
```

## How to read the diagram

- Solid arrows describe the intended escrow lifecycle in the SOW and current contract model.
- Dashed arrows distinguish evidence types. The recorded Testnet transactions prove code uploads; the recorded regression results prove local/reproducible behavior coverage.
- The final SDK-backed transaction trail proves deployment, funded joins, ranked payout, delegated deadline refund, and cancellation refund on distinct instances.

**Text alternative:** An organizer configures and deploys a tournament escrow,
a player joins by paying the entry fee, then either a referee finalizes winners
for payout, an organizer cancels for refunds, or the settlement deadline passes
for a deadline refund. Earlier code uploads and regression tests support the
implementation, while the final SDK-backed Testnet run records live examples of
all three terminal outcomes on distinct contract instances.

## Source-backed interface illustration

![GGG tournament interface illustration showing an active SEA Mobile Legends Cup, prize pool and entry fee, participant list, live feed, join controls, and referee panel. This image illustrates the public project interface and is not proof of a live Testnet transaction.](https://github.com/artisam-ggg/ggg/raw/7999b30f9a35b771de2e6089ac4fa4f33f7d5667/homepage/home.png)

The image is a committed [public GGG repository asset](https://github.com/artisam-ggg/ggg/blob/7999b30f9a35b771de2e6089ac4fa4f33f7d5667/homepage/home.png). It illustrates the tournament experience only; the [Evidence index](evidence.md) remains the source for Testnet artifact proof.

See [D1](../deliverables/d1.md), [D2](../deliverables/d2.md), [D3](../deliverables/d3.md), and the [Evidence index](evidence.md) for the exact public links.
