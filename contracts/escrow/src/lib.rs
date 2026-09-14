#![no_std]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    symbol_short, token, Address, Env, Symbol, Vec,
};

/// Maximum settlement window accepted on every supported network.
///
/// Ninety days is a conservative Testnet-safe limit and is deliberately kept
/// uniform so client and contract validation cannot diverge by network.
pub const MAX_SETTLEMENT_HORIZON_SECS: u64 = 90 * 24 * 60 * 60;

const LEDGERS_PER_DAY: u32 = 17_280;
pub const TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS: u32 = 90 * LEDGERS_PER_DAY;
/// Keeps the contract instance and code available for the maximum 90-day
/// settlement window plus a conservative 30-day restoration margin.
pub const TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS: u32 = 120 * LEDGERS_PER_DAY;
/// Testnet-simulated operational ceiling. Refunds are individual O(1) claims,
/// so this limit is about bounded registration storage, not refund batching.
pub const MAX_PLAYERS: u32 = 100;
pub const MAX_WINNERS: u32 = 10;

/// Stable read-helper ABI for contracts deployed with the N-winner WASM.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TournamentInfo {
    pub organizer: Address,
    pub referee: Address,
    pub token: Address,
    pub entry_fee: i128,
    pub distribution_bps: Vec<u32>,
    pub settlement_deadline: u64,
    pub player_count: u32,
    pub finished: bool,
    pub cancelled: bool,
    pub winners: Vec<Address>,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Organizer,
    Referee,
    Token,
    EntryFee,
    DistributionBps,
    Players,
    Finished,
    Cancelled,
    Winners,
    PayoutAmounts,
    SettlementDeadline,
    Registered(Address),
    RefundClaimed(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1, // retained error code for compatibility with existing deployments
    BadDistributionLen = 2,
    BadDistributionSum = 3,
    NonPositiveEntryFee = 4,
    OrganizerIsReferee = 5,
    NotInitialized = 6,
    AlreadyFinished = 7,
    AlreadyCancelled = 8,
    AlreadyJoined = 9,
    WinnersNotDistinct = 10,
    WinnerNotRegistered = 11,
    DeadlineNotFuture = 12,
    DeadlineExceedsTestnetSafeHorizon = 13,
    DeadlineNotReached = 14,
    PlayerNotRegistered = 15,
    RefundAlreadyClaimed = 16,
    MaxPlayersReached = 17,
    DeadlineReached = 18,
    BadWinnersLen = 19,
    WinnerCountMismatch = 20,
    InvalidDistributionBps = 21,
    InvalidPool = 22,
}

/// Stable for #216: topics are ("refund_claimed", player); data is { amount }.
#[contractevent]
pub struct RefundClaimed {
    #[topic]
    pub player: Address,
    pub amount: i128,
}

pub(crate) fn deadline_reached(env: &Env, deadline: u64) -> bool {
    env.ledger().timestamp() >= deadline
}

fn require_before_deadline(env: &Env, deadline: u64) {
    if deadline_reached(env, deadline) {
        panic_with_error!(env, Error::DeadlineReached);
    }
}

fn extend_instance_ttl(env: &Env, threshold: u32) {
    env.storage()
        .instance()
        .extend_ttl(threshold, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
}

fn payout_amounts(env: &Env, pool: i128, distribution_bps: &Vec<u32>) -> Vec<i128> {
    if pool < 0 {
        panic_with_error!(env, Error::InvalidPool);
    }
    let whole = pool.checked_div(10_000).expect("pool div overflow");
    let remainder = pool.checked_rem(10_000).expect("pool rem overflow");
    let mut amounts = Vec::new(env);
    let mut distributed = 0i128;
    for bps in distribution_bps.iter() {
        let bps = i128::from(bps);
        let amount = whole
            .checked_mul(bps)
            .and_then(|base| {
                remainder
                    .checked_mul(bps)
                    .and_then(|fraction| fraction.checked_div(10_000))
                    .and_then(|fraction| base.checked_add(fraction))
            })
            .expect("payout overflow");
        distributed = distributed
            .checked_add(amount)
            .expect("payout sum overflow");
        amounts.push_back(amount);
    }
    let dust = pool.checked_sub(distributed).expect("payouts exceed pool");
    let first = amounts.get(0).expect("empty payout vector");
    amounts.set(0, first.checked_add(dust).expect("dust overflow"));
    amounts
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    pub fn __constructor(
        env: Env,
        organizer: Address,
        referee: Address,
        token: Address,
        entry_fee: i128,
        distribution_bps: Vec<u32>,
        settlement_deadline: u64,
    ) {
        organizer.require_auth();

        if distribution_bps.is_empty() || distribution_bps.len() > MAX_WINNERS {
            panic_with_error!(&env, Error::BadDistributionLen);
        }
        let mut sum: u32 = 0;
        for b in distribution_bps.iter() {
            if b == 0 || b > 10_000 {
                panic_with_error!(&env, Error::InvalidDistributionBps);
            }
            sum = sum.checked_add(b).expect("bps sum overflow");
        }
        if sum != 10_000 {
            panic_with_error!(&env, Error::BadDistributionSum);
        }
        if entry_fee <= 0 {
            panic_with_error!(&env, Error::NonPositiveEntryFee);
        }
        if organizer == referee {
            panic_with_error!(&env, Error::OrganizerIsReferee);
        }
        let now = env.ledger().timestamp();
        if settlement_deadline <= now {
            panic_with_error!(&env, Error::DeadlineNotFuture);
        }
        if settlement_deadline - now > MAX_SETTLEMENT_HORIZON_SECS {
            panic_with_error!(&env, Error::DeadlineExceedsTestnetSafeHorizon);
        }

        let storage = env.storage().instance();
        storage.set(&DataKey::Organizer, &organizer);
        storage.set(&DataKey::Referee, &referee);
        storage.set(&DataKey::Token, &token);
        storage.set(&DataKey::EntryFee, &entry_fee);
        storage.set(&DataKey::DistributionBps, &distribution_bps);
        storage.set(&DataKey::Players, &Vec::<Address>::new(&env));
        storage.set(&DataKey::Finished, &false);
        storage.set(&DataKey::Cancelled, &false);
        storage.set(&DataKey::SettlementDeadline, &settlement_deadline);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
    }

    pub fn get_pool(env: Env) -> i128 {
        let storage = env.storage().instance();
        let token: Option<Address> = storage.get(&DataKey::Token);
        token
            .map(|token| {
                token::TokenClient::new(&env, &token).balance(&env.current_contract_address())
            })
            .unwrap_or(0)
    }

    /// Returns registration-ordered players; length never exceeds MAX_PLAYERS.
    pub fn get_players(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Players)
            .unwrap_or(Vec::new(&env))
    }

    /// Returns immutable configuration plus current status and ranked winners.
    pub fn get_tournament(env: Env) -> TournamentInfo {
        let storage = env.storage().instance();
        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        TournamentInfo {
            organizer: storage.get(&DataKey::Organizer).unwrap(),
            referee: storage.get(&DataKey::Referee).unwrap(),
            token: storage.get(&DataKey::Token).unwrap(),
            entry_fee: storage.get(&DataKey::EntryFee).unwrap(),
            distribution_bps: storage.get(&DataKey::DistributionBps).unwrap(),
            settlement_deadline: storage.get(&DataKey::SettlementDeadline).unwrap(),
            player_count: players.len(),
            finished: storage.get(&DataKey::Finished).unwrap_or(false),
            cancelled: storage.get(&DataKey::Cancelled).unwrap_or(false),
            winners: storage.get(&DataKey::Winners).unwrap_or(Vec::new(&env)),
        }
    }

    /// Returns the initialized UTC Unix settlement deadline for state reconciliation.
    pub fn get_settlement_deadline(env: Env) -> Option<u64> {
        env.storage().instance().get(&DataKey::SettlementDeadline)
    }

    pub fn is_finished(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Finished)
            .unwrap_or(false)
    }

    pub fn get_reward(env: Env, player: Address) -> i128 {
        let storage = env.storage().instance();
        let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
        if !finished {
            return 0;
        }
        let winners: Vec<Address> = storage.get(&DataKey::Winners).unwrap();
        let amounts: Vec<i128> = storage.get(&DataKey::PayoutAmounts).unwrap();
        for i in 0..winners.len() {
            if winners.get(i).unwrap() == player {
                return amounts.get(i).unwrap();
            }
        }
        0
    }

    pub fn join_tournament(env: Env, player: Address) {
        player.require_auth();

        let storage = env.storage().instance();
        if !storage.has(&DataKey::Organizer) {
            panic_with_error!(&env, Error::NotInitialized);
        }
        let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
        let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
        if finished {
            panic_with_error!(&env, Error::AlreadyFinished);
        }
        if cancelled {
            panic_with_error!(&env, Error::AlreadyCancelled);
        }
        require_before_deadline(&env, storage.get(&DataKey::SettlementDeadline).unwrap());

        let mut players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        if players.contains(&player) {
            panic_with_error!(&env, Error::AlreadyJoined);
        }
        if players.len() >= MAX_PLAYERS {
            panic_with_error!(&env, Error::MaxPlayersReached);
        }

        let token: Address = storage.get(&DataKey::Token).unwrap();
        let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();

        let client = token::TokenClient::new(&env, &token);
        client.transfer(&player, &env.current_contract_address(), &entry_fee);

        players.push_back(player.clone());
        storage.set(&DataKey::Registered(player.clone()), &true);
        storage.set(&DataKey::Players, &players);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        let pool_after = (players.len() as i128)
            .checked_mul(entry_fee)
            .expect("pool overflow");
        env.events()
            .publish((Symbol::new(&env, "registered"), player), pool_after);
    }

    pub fn finalize_results(env: Env, winners: Vec<Address>) {
        let storage = env.storage().instance();
        if !storage.has(&DataKey::Organizer) {
            panic_with_error!(&env, Error::NotInitialized);
        }
        let referee: Address = storage.get(&DataKey::Referee).unwrap();
        referee.require_auth();

        let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
        let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
        if finished {
            panic_with_error!(&env, Error::AlreadyFinished);
        }
        if cancelled {
            panic_with_error!(&env, Error::AlreadyCancelled);
        }
        require_before_deadline(&env, storage.get(&DataKey::SettlementDeadline).unwrap());

        let dist: Vec<u32> = storage.get(&DataKey::DistributionBps).unwrap();
        if winners.is_empty() || winners.len() > MAX_WINNERS {
            panic_with_error!(&env, Error::BadWinnersLen);
        }
        if winners.len() != dist.len() {
            panic_with_error!(&env, Error::WinnerCountMismatch);
        }
        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        let mut seen = Vec::<Address>::new(&env);
        for winner in winners.iter() {
            if seen.contains(&winner) {
                panic_with_error!(&env, Error::WinnersNotDistinct);
            }
            if !players.contains(&winner) {
                panic_with_error!(&env, Error::WinnerNotRegistered);
            }
            seen.push_back(winner);
        }

        let token: Address = storage.get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        let contract = env.current_contract_address();
        let amounts = payout_amounts(&env, client.balance(&contract), &dist);
        for i in 0..winners.len() {
            let amount = amounts.get(i).unwrap();
            if amount > 0 {
                client.transfer(&contract, &winners.get(i).unwrap(), &amount);
            }
        }

        storage.set(&DataKey::Finished, &true);
        storage.set(&DataKey::Winners, &winners);
        storage.set(&DataKey::PayoutAmounts, &amounts);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        env.events()
            .publish((symbol_short!("finalized"),), (winners, amounts));
    }

    pub fn cancel_tournament(env: Env) {
        let storage = env.storage().instance();
        if !storage.has(&DataKey::Organizer) {
            panic_with_error!(&env, Error::NotInitialized);
        }
        let organizer: Address = storage.get(&DataKey::Organizer).unwrap();
        organizer.require_auth();

        let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
        let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
        if finished {
            panic_with_error!(&env, Error::AlreadyFinished);
        }
        if cancelled {
            panic_with_error!(&env, Error::AlreadyCancelled);
        }
        require_before_deadline(&env, storage.get(&DataKey::SettlementDeadline).unwrap());

        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        storage.set(&DataKey::Cancelled, &true);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        env.events()
            .publish((symbol_short!("cancelled"),), players.len() as u32);
    }

    /// Anyone may submit this claim, but it always pays the registered player.
    /// Cancellation enables immediate claims; otherwise the deadline is inclusive.
    pub fn claim_refund(env: Env, player: Address) {
        let storage = env.storage().instance();
        if !storage.has(&DataKey::Organizer) {
            panic_with_error!(&env, Error::NotInitialized);
        }
        if storage.get(&DataKey::Finished).unwrap_or(false) {
            panic_with_error!(&env, Error::AlreadyFinished);
        }

        if !storage.has(&DataKey::Registered(player.clone())) {
            panic_with_error!(&env, Error::PlayerNotRegistered);
        }
        let claimed_key = DataKey::RefundClaimed(player.clone());
        if storage.has(&claimed_key) {
            panic_with_error!(&env, Error::RefundAlreadyClaimed);
        }
        let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
        let deadline: u64 = storage.get(&DataKey::SettlementDeadline).unwrap();
        if !cancelled && !deadline_reached(&env, deadline) {
            panic_with_error!(&env, Error::DeadlineNotReached);
        }

        let token: Address = storage.get(&DataKey::Token).unwrap();
        let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &player,
            &entry_fee,
        );
        storage.set(&claimed_key, &true);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);
        RefundClaimed {
            player,
            amount: entry_fee,
        }
        .publish(&env);
    }
}

#[cfg(test)]
mod test;
