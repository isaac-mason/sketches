#/bin/bash

CHUNK_SIZE=16

bun run voxelize-cli.ts \
    --input "files/Jonotla_Puebla_MX_PC.ply" \
    --output "public/Jonotla_Puebla_MX_PC.bin" \
    --resolution 50 \
    --chunkSize $CHUNK_SIZE \
    --gain 1.7 \
    --grid 1

bun run voxelize-cli.ts \
    --input "files/Yanhuitlan_Convento_Oax_PC.ply" \
    --output "public/Yanhuitlan_Convento_Oax_PC.bin" \
    --resolution 50 \
    --chunkSize $CHUNK_SIZE \
    --gain 1.7 \
    --grid 1
