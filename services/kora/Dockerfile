FROM rust:1.88

RUN cargo install kora-cli --version 2.0.5 --locked

WORKDIR /app
COPY kora.toml ./
COPY signers.toml ./

CMD kora --config kora.toml --rpc-url ${RPC_URL} rpc start --signers-config signers.toml --port ${PORT:-8080} --logging-format json
