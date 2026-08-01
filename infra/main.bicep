// EHR landing zone — single region, single practice.
// Deploy per environment: az deployment group create -g rg-ehr-<env> -f main.bicep -p env=<env>

@allowed(['dev', 'staging', 'prod'])
param env string = 'prod'
param location string = resourceGroup().location
param postgresAdminLogin string = 'ehradmin'
@secure()
param postgresAdminPassword string

var suffix = uniqueString(resourceGroup().id)
var tags = { workload: 'optical-ehr', environment: env }

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-ehr-${env}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/16'] }
    subnets: [
      {
        name: 'snet-app'
        properties: {
          addressPrefix: '10.20.1.0/24'
          delegations: [
            { name: 'appservice', properties: { serviceName: 'Microsoft.Web/serverFarms' } }
          ]
          serviceEndpoints: [{ service: 'Microsoft.Storage' }, { service: 'Microsoft.KeyVault' }]
        }
      }
      {
        name: 'snet-db'
        properties: {
          addressPrefix: '10.20.2.0/24'
          delegations: [
            { name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }
          ]
        }
      }
    ]
  }
}

resource dnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'ehr-${env}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dnsZone
  name: 'link-vnet-ehr'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: 'psql-ehr-${env}-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B2s', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 64, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 35, geoRedundantBackup: env == 'prod' ? 'Enabled' : 'Disabled' }
    network: {
      delegatedSubnetResourceId: vnet.properties.subnets[1].id
      privateDnsZoneArmResourceId: dnsZone.id
    }
    highAvailability: { mode: 'Disabled' }
  }
  dependsOn: [dnsLink]
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stehr${env}${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [{ id: vnet.properties.subnets[0].id, action: 'Allow' }]
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 30 }
    isVersioningEnabled: true
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'documents'
  properties: { publicAccess: 'None' }
}

resource reportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'reports'
  properties: { publicAccess: 'None' }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-ehr-${env}-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [{ id: vnet.properties.subnets[0].id }]
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-ehr-${env}'
  location: location
  tags: tags
  kind: 'web'
  properties: { Application_Type: 'web' }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-ehr-${env}'
  location: location
  tags: tags
  sku: { name: env == 'prod' ? 'P0v3' : 'B1' }
  kind: 'linux'
  properties: { reserved: true }
}

resource apiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-ehr-api-${env}-${suffix}'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    virtualNetworkSubnetId: vnet.properties.subnets[0].id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: env == 'prod'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'KEY_VAULT_URI', value: keyVault.properties.vaultUri }
        { name: 'NODE_ENV', value: 'production' }
      ]
    }
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-ehr-web-${env}-${suffix}'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: env == 'prod'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'NODE_ENV', value: 'production' }
      ]
    }
  }
}

// Role assignments: API app -> Key Vault Secrets User, Storage Blob Data Contributor
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiApp.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, apiApp.id, 'blob-data-contributor')
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output apiAppName string = apiApp.name
output webAppName string = webApp.name
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output storageAccountName string = storage.name
output keyVaultUri string = keyVault.properties.vaultUri
