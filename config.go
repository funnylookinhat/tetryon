package main

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"os"
)

type TetryonConfig struct {
	MongoConfig MongoConfig `json:"mongodb"`
	HttpConfig  HttpConfig  `json:"http"`
	HttpsConfig HttpsConfig `json:"https"`
}

type MongoConfig struct {
	Hostname string `json:"hostname"`
	Database string `json:"database"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type HttpConfig struct {
	Port string `json:"port"`
}

type HttpsConfig struct {
	Port string `json:"port"`
	Key  string `json:"key"`
	Cert string `json:"cert"`
}

func loadTetryonConfig(configPath string) (*TetryonConfig, error) {

	if configPath[len(configPath)-1:] != "/" {
		configPath = configPath + "/"
	}

	tetryonConfigData, err := ioutil.ReadFile(configPath + configFile)

	if err != nil {
		return nil, err
	}

	configFileInfo, _ := os.Stat(configPath + configFile)
	configFileMode := configFileInfo.Mode()

	if configFileMode&0x0007 > 0 {
		return nil, errors.New("Config error: " + configFile + " must not be world-readable.")
	}

	var tetryonConfig TetryonConfig
	json.Unmarshal(tetryonConfigData, &tetryonConfig)

	// Validate Config
	// It would be nice to find a more efficient way to loop this ( including errors
	// with the json key path )
	if len(tetryonConfig.MongoConfig.Hostname) == 0 {
		return nil, errors.New("Config error: missing mongodb.hostname")
	}

	if len(tetryonConfig.MongoConfig.Database) == 0 {
		return nil, errors.New("Config error: missing mongodb.database")
	}

	if len(tetryonConfig.MongoConfig.Username) == 0 {
		return nil, errors.New("Config error: missing mongodb.username")
	}

	if len(tetryonConfig.MongoConfig.Password) == 0 {
		return nil, errors.New("Config error: missing mongodb.password")
	}

	if len(tetryonConfig.HttpConfig.Port) == 0 {
		return nil, errors.New("Config error: missing http.port")
	}

	if len(tetryonConfig.HttpsConfig.Port) == 0 {
		return nil, errors.New("Config error: missing https.port")
	}

	if len(tetryonConfig.HttpsConfig.Cert) == 0 {
		return nil, errors.New("Config error: missing https.cert")
	}

	if len(tetryonConfig.HttpsConfig.Key) == 0 {
		return nil, errors.New("Config error: missing https.key")
	}

	if tetryonConfig.HttpsConfig.Cert[len(tetryonConfig.HttpsConfig.Cert)-1:] != "/" {
		tetryonConfig.HttpsConfig.Cert = configPath + tetryonConfig.HttpsConfig.Cert
	}

	if tetryonConfig.HttpsConfig.Key[len(tetryonConfig.HttpsConfig.Key)-1:] != "/" {
		tetryonConfig.HttpsConfig.Key = configPath + tetryonConfig.HttpsConfig.Key
	}

	return &tetryonConfig, nil
}
