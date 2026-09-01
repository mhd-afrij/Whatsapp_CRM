<?php

it('reports service health with database and redis probe results', function () {
    $response = $this->getJson('/api/v1/health');

    $response->assertJsonStructure([
        'status',
        'service',
        'database',
        'redis',
    ])->assertJson([
        'service' => 'crm-api',
    ]);

    expect($response->status())->toBeIn([200, 503]);
});
