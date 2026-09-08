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
    SettlementDeadline,
    RefundClaimed(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
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

fn extend_instance_ttl(env: &Env, threshold: u32) {
    env.storage()
        .instance()
        .extend_ttl(threshold, TESTNET_INSTANCE_TTL_EXTEND_TO_LEDGERS);
}

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    pub fn initialize(
        env: Env,
        organizer: Address,
        referee: Address,
        token: Address,
        entry_fee: i128,
        distribution_bps: Vec<u32>,
        settlement_deadline: u64,
    ) {
        if env.storage().instance().has(&DataKey::Organizer) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        organizer.require_auth();

        if distribution_bps.len() != 3 {
            panic_with_error!(&env, Error::BadDistributionLen);
        }
        let mut sum: u32 = 0;
        for b in distribution_bps.iter() {
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
        let players: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Players)
            .unwrap_or(Vec::new(&env));
        let entry_fee: i128 = env
            .storage()
            .instance()
            .get(&DataKey::EntryFee)
            .unwrap_or(0);
        (players.len() as i128)
            .checked_mul(entry_fee)
            .expect("pool overflow")
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
        let winners: Option<(Address, Address, Address)> = storage.get(&DataKey::Winners);
        let (first, second, third) = match winners {
            Some(w) => w,
            None => return 0,
        };

        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
        let pool: i128 = (players.len() as i128)
            .checked_mul(entry_fee)
            .expect("pool overflow");
        let dist: Vec<u32> = storage.get(&DataKey::DistributionBps).unwrap();

        let mut amounts: Vec<i128> = Vec::new(&env);
        let mut distributed: i128 = 0;
        for b in dist.iter() {
            let amt = pool
                .checked_mul(b as i128)
                .expect("mul overflow")
                .checked_div(10_000)
                .expect("div");
            amounts.push_back(amt);
            distributed = distributed.checked_add(amt).expect("dist overflow");
        }
        let dust = pool.checked_sub(distributed).expect("dust underflow");
        let first_amt = amounts.get(0).unwrap().checked_add(dust).expect("dust add");

        if player == first {
            first_amt
        } else if player == second {
            amounts.get(1).unwrap()
        } else if player == third {
            amounts.get(2).unwrap()
        } else {
            0
        }
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
        storage.set(&DataKey::Players, &players);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        let pool_after = (players.len() as i128)
            .checked_mul(entry_fee)
            .expect("pool overflow");
        env.events()
            .publish((Symbol::new(&env, "registered"), player), pool_after);
    }

    pub fn finalize_results(env: Env, first: Address, second: Address, third: Address) {
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

        // Distinct.
        if first == second || first == third || second == third {
            panic_with_error!(&env, Error::WinnersNotDistinct);
        }

        // Registered.
        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        if !players.contains(&first) || !players.contains(&second) || !players.contains(&third) {
            panic_with_error!(&env, Error::WinnerNotRegistered);
        }

        let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
        let pool: i128 = (players.len() as i128)
            .checked_mul(entry_fee)
            .expect("pool overflow");
        let dist: Vec<u32> = storage.get(&DataKey::DistributionBps).unwrap();

        // prize[i] = pool * bps[i] / 10000, checked.
        let mut amounts: Vec<i128> = Vec::new(&env);
        let mut distributed: i128 = 0;
        for b in dist.iter() {
            let amt = pool
                .checked_mul(b as i128)
                .expect("prize mul overflow")
                .checked_div(10_000)
                .expect("prize div");
            amounts.push_back(amt);
            distributed = distributed.checked_add(amt).expect("dist overflow");
        }
        // Deterministic dust → 1st place.
        let dust = pool.checked_sub(distributed).expect("dust underflow");
        let first_amt = amounts.get(0).unwrap().checked_add(dust).expect("dust add");
        amounts.set(0, first_amt);

        let token: Address = storage.get(&DataKey::Token).unwrap();
        let client = token::TokenClient::new(&env, &token);
        let contract = env.current_contract_address();
        client.transfer(&contract, &first, &amounts.get(0).unwrap());
        client.transfer(&contract, &second, &amounts.get(1).unwrap());
        client.transfer(&contract, &third, &amounts.get(2).unwrap());

        storage.set(&DataKey::Finished, &true);
        storage.set(
            &DataKey::Winners,
            &(first.clone(), second.clone(), third.clone()),
        );
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        env.events()
            .publish((symbol_short!("finalized"), first, second, third), amounts);
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

        storage.set(&DataKey::Cancelled, &true);
        extend_instance_ttl(&env, TESTNET_INSTANCE_TTL_BUMP_THRESHOLD_LEDGERS);

        env.events().publish((symbol_short!("cancelled"),), ());
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

        let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
        if !players.contains(&player) {
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
