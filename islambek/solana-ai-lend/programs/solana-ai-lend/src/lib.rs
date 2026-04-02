use anchor_lang::prelude::*;

declare_id!("HfTwgCwDTHpfrCKkgrruiuHaMKj79AVjyQSTwyoH9NVy");

#[program]
pub mod solana_ai_lend {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
